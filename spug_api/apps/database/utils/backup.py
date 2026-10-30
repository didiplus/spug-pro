"""数据库备份创建函数 + 注册表"""
import os
import re
import time
import subprocess
import tempfile
import gzip

from .imports import redis, MongoClient, pymssql, sqlite3_module, ESClient
from .common import BACKUP_DIR


def create_mysql_backup(instance, database=None, created_by_id=None):
    """执行 MySQL 备份，返回备份文件路径和大小"""
    ts = time.strftime('%Y%m%d_%H%M%S')
    db_suffix = f"_{database}" if database else "_all"
    filename = f"mysql_{instance.id}{db_suffix}_{ts}.sql.gz"
    filepath = os.path.join(BACKUP_DIR, filename)

    defaults_file = None
    try:
        defaults_fd = tempfile.NamedTemporaryFile(mode='w', suffix='.cnf', delete=False)
        defaults_fd.write(f"[mysqldump]\nhost={instance.host}\nport={instance.port}\nuser={instance.username}\npassword={instance.password or ''}\n")
        defaults_fd.flush()
        defaults_fd.close()
        defaults_file = defaults_fd.name
        os.chmod(defaults_file, 0o600)

        cmd = [
            'mysqldump',
            f'--defaults-extra-file={defaults_file}',
            '--single-transaction',
            '--routines',
            '--triggers',
            '--events',
            '--skip-ssl',
        ]
        if database:
            cmd.append(database)
        else:
            cmd.append('--all-databases')

        start = time.time()
        proc = subprocess.run(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=3600,
        )
        if proc.returncode != 0:
            err_msg = proc.stderr.decode('utf-8', errors='replace')[:500]
            raise RuntimeError(f'mysqldump failed: {err_msg}')
        with gzip.open(filepath, 'wb') as gz:
            gz.write(proc.stdout)
        file_size = os.path.getsize(filepath)
        duration = int((time.time() - start) * 1000)
        return filepath, file_size, duration
    except FileNotFoundError:
        raise RuntimeError('mysqldump 命令不存在，请安装 MySQL 客户端工具')
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise e
    finally:
        if defaults_file and os.path.exists(defaults_file):
            os.remove(defaults_file)


def create_postgresql_backup(instance, database=None, created_by_id=None):
    """执行 PostgreSQL 备份，返回备份文件路径和大小"""
    ts = time.strftime('%Y%m%d_%H%M%S')
    db_name = database or 'all'
    filename = f"pg_{instance.id}_{db_name}_{ts}.dump"
    filepath = os.path.join(BACKUP_DIR, filename)

    env = os.environ.copy()
    env['PGPASSWORD'] = instance.password or ''

    start = time.time()
    try:
        if database:
            cmd = [
                'pg_dump',
                f'-h{instance.host}',
                f'-p{instance.port}',
                f'-U{instance.username or "postgres"}',
                '-Fc',
                '-w',
                database,
            ]
        else:
            cmd = [
                'pg_dumpall',
                f'-h{instance.host}',
                f'-p{instance.port}',
                f'-U{instance.username or "postgres"}',
                '-w',
            ]
        proc = subprocess.run(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env=env, timeout=3600,
        )
        if proc.returncode != 0:
            err_msg = proc.stderr.decode('utf-8', errors='replace')[:500]
            raise RuntimeError(f'pg_dump failed: {err_msg}')
        with open(filepath, 'wb') as f:
            f.write(proc.stdout)
        file_size = os.path.getsize(filepath)
        duration = int((time.time() - start) * 1000)
        return filepath, file_size, duration
    except FileNotFoundError:
        raise RuntimeError('pg_dump 命令不存在，请安装 PostgreSQL 客户端工具')
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise e


def create_redis_backup(instance, database=None, created_by_id=None):
    """执行 Redis 备份，通过 redis-cli --rdb 导出 RDB 文件"""
    ts = time.strftime('%Y%m%d_%H%M%S')
    db_suffix = f"_db{database}" if database else "_all"
    filename = f"redis_{instance.id}{db_suffix}_{ts}.rdb.gz"
    filepath = os.path.join(BACKUP_DIR, filename)

    if redis is None:
        raise ImportError("redis is not installed")

    conn_params = {"host": instance.host, "port": int(instance.port),
                   "socket_connect_timeout": 10, "socket_timeout": 3600,
                   "decode_responses": False}
    if instance.username and str(instance.username).strip():
        conn_params["username"] = instance.username
    if instance.password and str(instance.password).strip():
        conn_params["password"] = instance.password

    start = time.time()
    try:
        client = redis.Redis(**conn_params)
        client.ping()

        rdb_fd = tempfile.NamedTemporaryFile(mode='wb', suffix='.rdb', delete=False)
        rdb_fd.close()
        rdb_path = rdb_fd.name

        cmd = ['redis-cli', '-h', instance.host, '-p', str(instance.port), '--rdb', rdb_path]
        if instance.username:
            cmd.extend(['--user', instance.username])

        env = dict(os.environ)
        if instance.password:
            env['REDISCLI_AUTH'] = instance.password

        proc = subprocess.run(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=3600, env=env,
        )
        if proc.returncode != 0:
            err_msg = proc.stderr.decode('utf-8', errors='replace')[:500]
            raise RuntimeError(f'redis-cli --rdb failed: {err_msg}')
        if not os.path.exists(rdb_path) or os.path.getsize(rdb_path) == 0:
            raise RuntimeError('redis-cli --rdb 导出文件为空')

        with gzip.open(filepath, 'wb') as gz:
            with open(rdb_path, 'rb') as rdb:
                gz.write(rdb.read())

        os.remove(rdb_path)
        file_size = os.path.getsize(filepath)
        duration = int((time.time() - start) * 1000)
        return filepath, file_size, duration
    except FileNotFoundError:
        raise RuntimeError('redis-cli 命令不存在，请安装 Redis 客户端工具')
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise e


def create_mongo_backup(instance, database=None, created_by_id=None):
    """执行 MongoDB 备份，通过 mongodump --archive --gzip 导出"""
    if MongoClient is None:
        raise ImportError("pymongo is not installed")

    ts = time.strftime('%Y%m%d_%H%M%S')
    db_suffix = f"_{database}" if database else "_all"
    filename = f"mongo_{instance.id}{db_suffix}_{ts}.archive.gz"
    filepath = os.path.join(BACKUP_DIR, filename)

    start = time.time()
    try:
        cmd = [
            'mongodump',
            f'--host={instance.host}',
            f'--port={instance.port}',
            '--archive', filepath,
            '--gzip',
        ]
        if instance.username:
            cmd.extend([f'--username={instance.username}'])
        if instance.password:
            cmd.extend([f'--password={instance.password}'])
        if database:
            cmd.extend([f'--db={database}'])

        proc = subprocess.run(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=3600,
        )
        if proc.returncode != 0:
            err_msg = proc.stderr.decode('utf-8', errors='replace')[:500]
            raise RuntimeError(f'mongodump failed: {err_msg}')
        if not os.path.exists(filepath) or os.path.getsize(filepath) == 0:
            raise RuntimeError('mongodump 导出文件为空')
        file_size = os.path.getsize(filepath)
        duration = int((time.time() - start) * 1000)
        return filepath, file_size, duration
    except FileNotFoundError:
        raise RuntimeError('mongodump 命令不存在，请安装 MongoDB 客户端工具')
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise e


def create_mariadb_backup(instance, database=None, created_by_id=None):
    """执行 MariaDB 备份，复用 mysqldump"""
    ts = time.strftime('%Y%m%d_%H%M%S')
    db_suffix = f"_{database}" if database else "_all"
    filename = f"mariadb_{instance.id}{db_suffix}_{ts}.sql.gz"
    filepath = os.path.join(BACKUP_DIR, filename)

    defaults_file = None
    try:
        fd = tempfile.NamedTemporaryFile(mode='w', suffix='.cnf', delete=False)
        fd.write(f"[mysqldump]\nhost={instance.host}\nport={instance.port}\nuser={instance.username}\npassword={instance.password or ''}\n")
        fd.flush()
        fd.close()
        defaults_file = fd.name
        os.chmod(defaults_file, 0o600)
        cmd = ['mysqldump', f'--defaults-extra-file={defaults_file}', '--single-transaction', '--routines', '--triggers', '--events']
        cmd.append(database if database else '--all-databases')
        start = time.time()
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3600)
        if proc.returncode != 0:
            raise RuntimeError(f'mysqldump failed: {proc.stderr.decode("utf-8", errors="replace")[:500]}')
        with gzip.open(filepath, 'wb') as gz:
            gz.write(proc.stdout)
        return filepath, os.path.getsize(filepath), int((time.time() - start) * 1000)
    except FileNotFoundError:
        raise RuntimeError('mysqldump 命令不存在')
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise e
    finally:
        if defaults_file and os.path.exists(defaults_file):
            os.remove(defaults_file)


def create_tidb_backup(instance, database=None, created_by_id=None):
    """执行 TiDB 备份，复用 mysqldump（TiDB 兼容 MySQL 协议）"""
    ts = time.strftime('%Y%m%d_%H%M%S')
    db_suffix = f"_{database}" if database else "_all"
    filename = f"tidb_{instance.id}{db_suffix}_{ts}.sql.gz"
    filepath = os.path.join(BACKUP_DIR, filename)

    defaults_file = None
    try:
        fd = tempfile.NamedTemporaryFile(mode='w', suffix='.cnf', delete=False)
        fd.write(f"[mysqldump]\nhost={instance.host}\nport={instance.port}\nuser={instance.username}\npassword={instance.password or ''}\n")
        fd.flush()
        fd.close()
        defaults_file = fd.name
        os.chmod(defaults_file, 0o600)
        cmd = ['mysqldump', f'--defaults-extra-file={defaults_file}', '--single-transaction', '--routines', '--triggers']
        cmd.append(database if database else '--all-databases')
        start = time.time()
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3600)
        if proc.returncode != 0:
            raise RuntimeError(f'mysqldump failed: {proc.stderr.decode("utf-8", errors="replace")[:500]}')
        with gzip.open(filepath, 'wb') as gz:
            gz.write(proc.stdout)
        return filepath, os.path.getsize(filepath), int((time.time() - start) * 1000)
    except FileNotFoundError:
        raise RuntimeError('mysqldump 命令不存在')
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise e
    finally:
        if defaults_file and os.path.exists(defaults_file):
            os.remove(defaults_file)


def create_mssql_backup(instance, database=None, created_by_id=None):
    """执行 SQL Server 备份，使用 sqlcmd + BACKUP DATABASE"""
    ts = time.strftime('%Y%m%d_%H%M%S')
    db_name = database or 'master'
    if not re.match(r'^[A-Za-z0-9_.$-]+$', db_name):
        raise RuntimeError(f'Invalid database name: {db_name}')
    filename = f"mssql_{instance.id}_{db_name}_{ts}.bak"
    filepath = os.path.join(BACKUP_DIR, filename)

    start = time.time()
    try:
        conn = pymssql.connect(server=instance.host, port=int(instance.port), user=instance.username, password=instance.password, database=db_name, connect_timeout=10)
        try:
            with conn.cursor() as cursor:
                cursor.execute(f"BACKUP DATABASE [{db_name}] TO DISK = '{filepath}' WITH FORMAT, COMPRESSION")
                conn.commit()
        finally:
            conn.close()
        if not os.path.exists(filepath):
            raise RuntimeError('BACKUP 命令执行完成但文件未生成')
        return filepath, os.path.getsize(filepath), int((time.time() - start) * 1000)
    except FileNotFoundError:
        raise RuntimeError('pymssql 未安装')
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise e


def create_oracle_backup(instance, database=None, created_by_id=None):
    """执行 Oracle 备份，使用 expdp 数据泵"""
    ts = time.strftime('%Y%m%d_%H%M%S')
    db_name = database or 'ORCL'
    filename = f"oracle_{instance.id}_{db_name}_{ts}.dmp"
    filepath = os.path.join(BACKUP_DIR, filename)

    env = os.environ.copy()
    start = time.time()
    parfile_path = None
    try:
        parfile_fd = tempfile.NamedTemporaryFile(mode='w', suffix='.par', delete=False)
        os.chmod(parfile_fd.name, 0o600)
        parfile_fd.write(f"USERID={instance.username}/{instance.password or ''}@{instance.host}:{instance.port}/{db_name}\n")
        parfile_fd.write(f"DUMPFILE={filename}\n")
        parfile_fd.write("DIRECTORY=DATA_PUMP_DIR\n")
        parfile_fd.write("COMPRESSION=ALL\n")
        if database:
            parfile_fd.write(f"SCHEMAS={database}\n")
        else:
            parfile_fd.write("FULL=Y\n")
        parfile_fd.flush()
        parfile_fd.close()
        parfile_path = parfile_fd.name

        cmd = ['expdp', f'PARFILE={parfile_path}']
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=3600)
        if proc.returncode != 0:
            raise RuntimeError(f'expdp failed: {proc.stderr.decode("utf-8", errors="replace")[:500]}')
        if not os.path.exists(filepath):
            raise RuntimeError('expdp 执行完成但文件未生成')
        return filepath, os.path.getsize(filepath), int((time.time() - start) * 1000)
    except FileNotFoundError:
        raise RuntimeError('expdp 命令不存在，请安装 Oracle 客户端工具')
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise e
    finally:
        if parfile_path and os.path.exists(parfile_path):
            os.remove(parfile_path)


def create_sqlite_backup(instance, database=None, created_by_id=None):
    """执行 SQLite 备份，使用 VACUUM INTO 或文件复制"""
    ts = time.strftime('%Y%m%d_%H%M%S')
    db_path = database or instance.host
    filename = f"sqlite_{instance.id}_{ts}.db"
    filepath = os.path.join(BACKUP_DIR, filename)

    start = time.time()
    try:
        conn = sqlite3_module.connect(db_path, timeout=10)
        try:
            safe_path = filepath.replace("'", "''")
            conn.execute(f"VACUUM INTO '{safe_path}'")
        finally:
            conn.close()
        if not os.path.exists(filepath):
            raise RuntimeError('VACUUM INTO 执行完成但文件未生成')
        return filepath, os.path.getsize(filepath), int((time.time() - start) * 1000)
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise e


def create_clickhouse_backup(instance, database=None, created_by_id=None):
    """执行 ClickHouse 备份，使用 clickhouse-client 导出"""
    ts = time.strftime('%Y%m%d_%H%M%S')
    db_suffix = f"_{database}" if database else "_all"
    filename = f"clickhouse_{instance.id}{db_suffix}_{ts}.sql.gz"
    filepath = os.path.join(BACKUP_DIR, filename)

    start = time.time()
    try:
        cmd = ['clickhouse-client', f'--host={instance.host}', f'--port={instance.port}']
        if instance.username:
            cmd.extend([f'--user={instance.username}'])
        if instance.password:
            cmd.extend([f'--password={instance.password}'])
        if database:
            cmd.extend(['-d', database, '--multiquery', '-q',
                        f"SELECT concat(arrayStringConcat(groupArray(query), '\\n')) FROM "
                        f"(SELECT format('CREATE TABLE IF NOT EXISTS `%s` AS SELECT * FROM `{database}`.`%s`', name, name) AS query "
                        f"FROM system.tables WHERE database = '{database}')"])
        else:
            cmd.extend(['--multiquery', '-q', 'SHOW DATABASES'])

        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3600)
        if proc.returncode != 0:
            raise RuntimeError(f'clickhouse-client failed: {proc.stderr.decode("utf-8", errors="replace")[:500]}')
        with gzip.open(filepath, 'wb') as gz:
            gz.write(proc.stdout)
        return filepath, os.path.getsize(filepath), int((time.time() - start) * 1000)
    except FileNotFoundError:
        raise RuntimeError('clickhouse-client 命令不存在')
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise e


def create_es_backup(instance, database=None, created_by_id=None):
    """执行 Elasticsearch 备份，使用快照 API"""
    if ESClient is None:
        raise ImportError("elasticsearch is not installed")

    ts = time.strftime('%Y%m%d_%H%M%S')
    repo_name = f"spug_backup_{ts}"
    snap_name = f"snap_{ts}"
    filename = f"es_{instance.id}_{snap_name}_{ts}.tar.gz"
    filepath = os.path.join(BACKUP_DIR, filename)

    start = time.time()
    try:
        client = ESClient(hosts=[f"http://{instance.host}:{int(instance.port)}"],
                          basic_auth=(instance.username, instance.password) if instance.username else None,
                          request_timeout=3600)
        client.snapshot.create_repository(repository=repo_name, type="fs",
                                           settings={"location": filepath.replace('.tar.gz', '')})
        body = {"indices": database} if database else {}
        client.snapshot.create(repository=repo_name, snapshot=snap_name, body=body, wait_for_completion=True)
        client.close()

        import tarfile
        with tarfile.open(filepath, "w:gz") as tar:
            tar.add(filepath.replace('.tar.gz', ''), arcname=os.path.basename(filepath.replace('.tar.gz', '')))
        return filepath, os.path.getsize(filepath), int((time.time() - start) * 1000)
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise e


def create_cassandra_backup(instance, database=None, created_by_id=None):
    """执行 Cassandra 备份，使用 nodetool snapshot"""
    ts = time.strftime('%Y%m%d_%H%M%S')
    filename = f"cassandra_{instance.id}_{ts}.tar.gz"
    filepath = os.path.join(BACKUP_DIR, filename)

    start = time.time()
    try:
        cmd = ['nodetool', '-h', instance.host, '-p', str(instance.port)]
        if instance.username:
            cmd.extend(['-u', instance.username])
        if instance.password:
            cmd.extend(['-pw', instance.password])
        cmd.extend(['snapshot'])
        if database:
            cmd.extend(['-kt', database])

        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3600)
        if proc.returncode != 0:
            raise RuntimeError(f'nodetool snapshot failed: {proc.stderr.decode("utf-8", errors="replace")[:500]}')

        import tarfile
        with tarfile.open(filepath, "w:gz") as tar:
            tar.add('/var/lib/cassandra/data', arcname='cassandra_data')
        return filepath, os.path.getsize(filepath), int((time.time() - start) * 1000)
    except FileNotFoundError:
        raise RuntimeError('nodetool 命令不存在，请安装 Cassandra 工具')
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise e


BACKUP_CREATORS = {
    "mysql": create_mysql_backup,
    "mariadb": create_mariadb_backup,
    "postgresql": create_postgresql_backup,
    "tidb": create_tidb_backup,
    "redis": create_redis_backup,
    "mongodb": create_mongo_backup,
    "mssql": create_mssql_backup,
    "oracle": create_oracle_backup,
    "sqlite": create_sqlite_backup,
    "clickhouse": create_clickhouse_backup,
    "elasticsearch": create_es_backup,
    "cassandra": create_cassandra_backup,
}
