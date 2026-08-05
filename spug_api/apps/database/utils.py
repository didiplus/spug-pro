import time
from typing import Dict, Union, Optional, List
from functools import wraps

try:
    import pymysql
except ImportError:
    pymysql = None

try:
    import redis
except ImportError:
    redis = None

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    psycopg2 = None

try:
    from pymongo import MongoClient
except ImportError:
    MongoClient = None


# =====================================================================
# 统一 Schema 定义
# =====================================================================
# 所有数据库类型的详情查询函数必须返回符合此 schema 的字典。
# 新增数据库类型时，只需实现一个 fetch_xxx_detail 函数并注册到
# DETAIL_FETCHERS 即可，前端无需任何改动。
#
# Schema:
# {
#     "metrics": [                          # 指标卡片（头部展示）
#         {
#             "key": "connections",         # 唯一标识
#             "label": "连接数",            # 显示名称
#             "value": "120/500",           # 显示值（字符串）
#             "color": "#fa8c16",           # 值颜色
#             "icon": "api"                 # 图标名（前端映射）
#         },
#         ...
#     ],
#     "databases": {                        # 数据库列表 Tab
#         "columns": [                      # 表格列定义
#             {"key": "name", "title": "数据库名", "width": 200},
#             {"key": "tables", "title": "表数量", "width": 120},
#         ],
#         "rows": [                         # 表格数据
#             {"name": "spug_prod", "tables": 128},
#         ]
#     },
#     "processes": {                        # 进程列表 Tab（可选，无则不显示）
#         "columns": [...],
#         "rows": [...]
#     },
#     "variables": {                        # 状态变量 Tab（可选，无则不显示）
#         "columns": [...],
#         "rows": [...]
#     }
# }
# =====================================================================


# ---------- 工具装饰器：统一计时和异常捕获 ----------
def timed_test(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        try:
            version = func(*args, **kwargs)
            latency_ms = int((time.perf_counter() - start) * 1000)
            return {"success": True, "version": version, "latency": latency_ms}
        except Exception as e:
            return {"success": False, "message": str(e)}
    return wrapper


# =====================================================================
# 连接测试函数
# =====================================================================

@timed_test
def test_connection_db(host, port, username, password):
    if pymysql is None:
        raise ImportError("pymysql is not installed. Run: pip install pymysql")
    with pymysql.connect(host=host, port=int(port), user=username, password=password, connect_timeout=5) as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT VERSION()")
            return cursor.fetchone()[0]


@timed_test
def test_connection_redis(host, port, username=None, password=None):
    if redis is None:
        raise ImportError("redis is not installed. Run: pip install redis")
    conn_params = {"host": host, "port": int(port), "socket_connect_timeout": 5, "socket_timeout": 5, "decode_responses": True}
    if username and str(username).strip():
        conn_params["username"] = username
    if password and str(password).strip():
        conn_params["password"] = password
    client = redis.Redis(**conn_params)
    client.ping()
    info = client.info("server")
    return info.get("redis_version", "unknown")


@timed_test
def test_connection_pg(host, port, username, password, database="postgres"):
    if psycopg2 is None:
        raise ImportError("psycopg2 is not installed. Run: pip install psycopg2-binary")
    conn = psycopg2.connect(host=host, port=int(port), user=username, password=password, dbname=database, connect_timeout=5)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT VERSION()")
            return cur.fetchone()[0]
    finally:
        conn.close()


@timed_test
def test_connection_mongo(host, port, username=None, password=None, auth_database="admin"):
    if MongoClient is None:
        raise ImportError("pymongo is not installed. Run: pip install pymongo")
    client = MongoClient(host=host, port=int(port), username=username, password=password, authSource=auth_database, connectTimeoutMS=5000, serverSelectionTimeoutMS=5000)
    server_info = client.admin.command("serverStatus")
    version = server_info.get("version", "unknown")
    client.close()
    return version


# =====================================================================
# 详情查询函数 — 统一返回 schema
# =====================================================================

def _format_uptime(seconds):
    s = int(seconds or 0)
    d, s = divmod(s, 86400)
    h, s = divmod(s, 3600)
    m, _ = divmod(s, 60)
    if d > 0:
        return f"{d}天{h}小时"
    if h > 0:
        return f"{h}小时{m}分"
    return f"{m}分钟"


def fetch_mysql_detail(host, port, username, password):
    if pymysql is None:
        raise ImportError("pymysql is not installed")

    with pymysql.connect(host=host, port=int(port), user=username, password=password, connect_timeout=5, charset='utf8mb4') as conn:
        with conn.cursor() as cursor:
            cursor.execute("SHOW DATABASES")
            all_dbs = cursor.fetchall()
            db_rows = []
            for (db_name,) in all_dbs:
                if db_name in ('information_schema', 'performance_schema', 'mysql', 'sys'):
                    continue
                try:
                    cursor.execute("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = %s", (db_name,))
                    table_count = cursor.fetchone()[0]
                except Exception:
                    table_count = 0
                db_rows.append({"name": db_name, "tables": table_count})

            cursor.execute("SHOW GLOBAL STATUS WHERE Variable_name IN "
                           "('Threads_connected','Max_used_connections',"
                           "'Queries','Slow_queries','Uptime')")
            sv = {}
            for row in cursor.fetchall():
                sv[row[0]] = row[1]

            cursor.execute("SHOW PROCESSLIST")
            cols = [desc[0] for desc in cursor.description]
            proc_rows = [dict(zip(cols, row)) for row in cursor.fetchall()]

    return {
        "metrics": [
            {"key": "connections", "label": "连接数", "value": f"{sv.get('Threads_connected', 0)}/{sv.get('Max_used_connections', '-')}", "color": "#fa8c16", "icon": "api"},
            {"key": "qps", "label": "QPS", "value": sv.get('Queries', '0'), "color": "#722ed1", "icon": "thunderbolt"},
            {"key": "slow_queries", "label": "慢查询", "value": sv.get('Slow_queries', '0'), "color": "#cf1322" if int(sv.get('Slow_queries', 0)) > 0 else "#52c41a", "icon": "clock"},
            {"key": "uptime", "label": "运行时长", "value": _format_uptime(sv.get('Uptime', 0)), "color": "#1890ff", "icon": "clock"},
        ],
        "databases": {
            "columns": [
                {"key": "name", "title": "数据库名", "width": 200},
                {"key": "tables", "title": "表数量", "width": 120},
            ],
            "rows": db_rows,
        },
        "processes": {
            "columns": [
                {"key": "Id", "title": "ID", "width": 70},
                {"key": "User", "title": "用户", "width": 120},
                {"key": "Host", "title": "主机", "width": 180},
                {"key": "db", "title": "数据库", "width": 120},
                {"key": "Command", "title": "命令", "width": 100},
                {"key": "Time", "title": "耗时", "width": 80},
                {"key": "State", "title": "状态", "ellipsis": True},
                {"key": "Info", "title": "SQL", "ellipsis": True},
            ],
            "rows": proc_rows,
        },
        "variables": None,
    }


def fetch_redis_detail(host, port, username=None, password=None):
    if redis is None:
        raise ImportError("redis is not installed")

    conn_params = {"host": host, "port": int(port), "socket_connect_timeout": 5, "socket_timeout": 5, "decode_responses": True}
    if username and str(username).strip():
        conn_params["username"] = username
    if password and str(password).strip():
        conn_params["password"] = password

    client = redis.Redis(**conn_params)
    client.ping()

    server_info = client.info("server")
    memory_info = client.info("memory")
    clients_info = client.info("clients")
    stats_info = client.info("stats")
    keyspace = client.info("keyspace")

    db_rows = []
    for k, v in keyspace.items():
        db_rows.append({"name": k, "keys": v.get("keys", 0), "expires": v.get("expires", 0), "avg_ttl": f"{v.get('avg_ttl', 0):.0f}ms" if v.get('avg_ttl') else "-"})

    var_rows = [
        {"name": "redis_version", "value": server_info.get("redis_version", "")},
        {"name": "uptime", "value": _format_uptime(server_info.get("uptime_in_seconds", 0))},
        {"name": "used_memory", "value": memory_info.get("used_memory_human", "")},
        {"name": "used_memory_peak", "value": memory_info.get("used_memory_peak_human", "")},
        {"name": "connected_clients", "value": clients_info.get("connected_clients", 0)},
        {"name": "total_commands", "value": stats_info.get("total_commands_processed", 0)},
        {"name": "ops_per_sec", "value": stats_info.get("instantaneous_ops_per_sec", 0)},
    ]

    return {
        "metrics": [
            {"key": "clients", "label": "连接客户端", "value": str(clients_info.get("connected_clients", 0)), "color": "#fa8c16", "icon": "api"},
            {"key": "ops", "label": "OPS", "value": str(stats_info.get("instantaneous_ops_per_sec", 0)), "color": "#722ed1", "icon": "thunderbolt"},
            {"key": "memory", "label": "内存使用", "value": memory_info.get("used_memory_human", "-"), "color": "#52c41a", "icon": "database"},
            {"key": "uptime", "label": "运行时长", "value": _format_uptime(server_info.get("uptime_in_seconds", 0)), "color": "#1890ff", "icon": "clock"},
        ],
        "databases": {
            "columns": [
                {"key": "name", "title": "数据库", "width": 150},
                {"key": "keys", "title": "键数量", "width": 120},
                {"key": "expires", "title": "过期键", "width": 120},
                {"key": "avg_ttl", "title": "平均TTL", "width": 120},
            ],
            "rows": db_rows,
        },
        "processes": None,
        "variables": {
            "columns": [
                {"key": "name", "title": "变量名", "width": 250},
                {"key": "value", "title": "值", "ellipsis": True},
            ],
            "rows": var_rows,
        },
    }


def fetch_pg_detail(host, port, username, password, database="postgres"):
    if psycopg2 is None:
        raise ImportError("psycopg2 is not installed")

    conn = psycopg2.connect(host=host, port=int(port), user=username, password=password, dbname=database, connect_timeout=5)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT datname FROM pg_database WHERE datistemplate = false")
            db_rows = [{"name": row[0]} for row in cur.fetchall()]

            cur.execute("SELECT version()")
            pg_version = cur.fetchone()[0]

            cur.execute("SELECT state, count(*) FROM pg_stat_activity GROUP BY state")
            state_rows = [{"state": row[0] or 'null', "count": row[1]} for row in cur.fetchall()]

            active = sum(r["count"] for r in state_rows if "active" in r["state"])
            idle = sum(r["count"] for r in state_rows if "idle" in r["state"])
    finally:
        conn.close()

    return {
        "metrics": [
            {"key": "active", "label": "活跃连接", "value": str(active), "color": "#fa8c16", "icon": "api"},
            {"key": "idle", "label": "空闲连接", "value": str(idle), "color": "#8c8c8c", "icon": "api"},
            {"key": "databases", "label": "数据库数", "value": str(len(db_rows)), "color": "#1890ff", "icon": "database"},
        ],
        "databases": {
            "columns": [
                {"key": "name", "title": "数据库名", "width": 250},
            ],
            "rows": db_rows,
        },
        "processes": None,
        "variables": {
            "columns": [
                {"key": "state", "title": "状态", "width": 200},
                {"key": "count", "title": "连接数", "width": 120},
            ],
            "rows": state_rows,
        },
    }


# =====================================================================
# 注册表：新增数据库类型只需在此添加一行
# =====================================================================

TEST_FETCHERS = {
    "mysql": test_connection_db,
    "redis": test_connection_redis,
    "postgresql": test_connection_pg,
    "mongodb": test_connection_mongo,
}


# =====================================================================
# SQL 执行函数 — 统一返回 schema
# =====================================================================

def execute_mysql_sql(host, port, username, password, sql, database=None, limit=1000):
    if pymysql is None:
        raise ImportError("pymysql is not installed")

    conn_params = {
        "host": host, "port": int(port),
        "user": username, "password": password,
        "connect_timeout": 10, "charset": "utf8mb4",
    }
    if database:
        conn_params["database"] = database

    with pymysql.connect(**conn_params) as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            if cursor.description:
                columns = [desc[0] for desc in cursor.description]
                rows = cursor.fetchmany(limit)
                data = [dict(zip(columns, row)) for row in rows]
                return {
                    "columns": columns,
                    "rows": data,
                    "affected": cursor.rowcount,
                    "truncated": cursor.rowcount > limit,
                }
            else:
                conn.commit()
                return {
                    "columns": [],
                    "rows": [],
                    "affected": cursor.rowcount,
                    "truncated": False,
                }


SQL_EXECUTORS = {
    "mysql": execute_mysql_sql,
}


# =====================================================================
# 慢查询分析 — 统一返回 schema
# =====================================================================

def fetch_mysql_slow_queries(host, port, username, password, limit=50):
    """从 performance_schema 和 sys 获取慢查询信息"""
    if pymysql is None:
        raise ImportError("pymysql is not installed")

    result = {
        "summary": {
            "columns": [
                {"key": "digest_text", "title": "SQL模板", "ellipsis": True},
                {"key": "schema_name", "title": "数据库", "width": 120},
                {"key": "exec_count", "title": "执行次数", "width": 100},
                {"key": "avg_latency_ms", "title": "平均耗时(ms)", "width": 120},
                {"key": "max_latency_ms", "title": "最大耗时(ms)", "width": 120},
                {"key": "total_latency_ms", "title": "总耗时(ms)", "width": 120},
                {"key": "rows_sent", "title": "返回行数", "width": 100},
                {"key": "rows_examined", "title": "扫描行数", "width": 100},
                {"key": "first_seen", "title": "首次出现", "width": 170},
                {"key": "last_seen", "title": "最后出现", "width": 170},
            ],
            "rows": [],
        },
        "recent": {
            "columns": [
                {"key": "digest_text", "title": "SQL语句", "ellipsis": True},
                {"key": "schema_name", "title": "数据库", "width": 120},
                {"key": "timer_start_ms", "title": "耗时(ms)", "width": 100},
                {"key": "rows_sent", "title": "返回行", "width": 80},
                {"key": "rows_examined", "title": "扫描行", "width": 80},
                {"key": "started_at", "title": "执行时间", "width": 170},
            ],
            "rows": [],
        },
        "metrics": [
            {"key": "slow_query_count", "label": "慢查询总数", "value": "0", "color": "#cf1322", "icon": "clock"},
            {"key": "avg_latency", "label": "平均耗时", "value": "0ms", "color": "#fa8c16", "icon": "clock"},
            {"key": "max_latency", "label": "最大耗时", "value": "0ms", "color": "#ff4d4f", "icon": "clock"},
            {"key": "total_exec", "label": "总执行次数", "value": "0", "color": "#1677ff", "icon": "api"},
        ],
    }

    with pymysql.connect(host=host, port=int(port), user=username, password=password,
                         connect_timeout=10, charset='utf8mb4') as conn:
        with conn.cursor() as cursor:
            try:
                cursor.execute("""
                    SELECT digest_text, schema_name, exec_count,
                           ROUND(avg_timer_wait / 1000000, 2) AS avg_latency_ms,
                           ROUND(max_timer_wait / 1000000, 2) AS max_latency_ms,
                           ROUND(sum_timer_wait / 1000000, 2) AS total_latency_ms,
                           sum_rows_sent AS rows_sent,
                           sum_rows_examined AS rows_examined,
                           first_seen, last_seen
                    FROM performance_schema.events_statements_summary_by_digest
                    WHERE digest_text IS NOT NULL
                      AND digest_text != ''
                    ORDER BY sum_timer_wait DESC
                    LIMIT %s
                """, (limit,))
                cols = [desc[0] for desc in cursor.description]
                rows = [dict(zip(cols, row)) for row in cursor.fetchall()]
                for r in rows:
                    r['digest_text'] = (r.get('digest_text') or '')[:500]
                    for k in ('first_seen', 'last_seen'):
                        if r.get(k):
                            r[k] = str(r[k])
                result['summary']['rows'] = rows

                total_exec = sum(r.get('exec_count', 0) or 0 for r in rows)
                total_latency = sum(r.get('total_latency_ms', 0) or 0 for r in rows)
                max_latency = max((r.get('max_latency_ms', 0) or 0 for r in rows), default=0)
                avg_latency = round(total_latency / total_exec, 2) if total_exec > 0 else 0

                result['metrics'] = [
                    {"key": "slow_query_count", "label": "慢查询总数", "value": str(len(rows)), "color": "#cf1322", "icon": "clock"},
                    {"key": "avg_latency", "label": "平均耗时", "value": f"{avg_latency}ms", "color": "#fa8c16", "icon": "clock"},
                    {"key": "max_latency", "label": "最大耗时", "value": f"{max_latency}ms", "color": "#ff4d4f", "icon": "clock"},
                    {"key": "total_exec", "label": "总执行次数", "value": str(total_exec), "color": "#1677ff", "icon": "api"},
                ]
            except Exception:
                pass

            try:
                cursor.execute("""
                    SELECT digest_text, schema_name,
                           ROUND(timer_wait / 1000000, 2) AS timer_start_ms,
                           rows_sent, rows_examined,
                           TIMER_START AS started_at
                    FROM performance_schema.events_statements_history_long
                    WHERE digest_text IS NOT NULL
                      AND digest_text != ''
                      AND timer_wait / 1000000 > 1000
                    ORDER BY timer_wait DESC
                    LIMIT %s
                """, (limit,))
                cols2 = [desc[0] for desc in cursor.description]
                rows2 = [dict(zip(cols2, row)) for row in cursor.fetchall()]
                for r in rows2:
                    r['digest_text'] = (r.get('digest_text') or '')[:500]
                    r['started_at'] = str(r.get('started_at', ''))
                result['recent']['rows'] = rows2
            except Exception:
                pass

    return result


SLOW_QUERY_FETCHERS = {
    "mysql": fetch_mysql_slow_queries,
}


# =====================================================================
# 备份管理
# =====================================================================
import os
import subprocess

BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'backups')
os.makedirs(BACKUP_DIR, exist_ok=True)


def create_mysql_backup(instance, database=None, created_by_id=None):
    """执行 MySQL 备份，返回备份文件路径和大小"""
    ts = time.strftime('%Y%m%d_%H%M%S')
    db_suffix = f"_{database}" if database else "_all"
    filename = f"mysql_{instance.id}{db_suffix}_{ts}.sql.gz"
    filepath = os.path.join(BACKUP_DIR, filename)

    cmd = [
        'mysqldump',
        f'-h{instance.host}',
        f'-P{instance.port}',
        f'-u{instance.username}',
        f'-p{instance.password}',
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
    try:
        with open(filepath, 'wb') as f:
            proc = subprocess.run(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                input=instance.password.encode() if instance.password else None,
                timeout=3600,
            )
            if proc.returncode != 0:
                err_msg = proc.stderr.decode('utf-8', errors='replace')[:500]
                if os.path.exists(filepath):
                    os.remove(filepath)
                raise RuntimeError(f'mysqldump failed: {err_msg}')
            import gzip
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


BACKUP_CREATORS = {
    "mysql": create_mysql_backup,
}


DETAIL_FETCHERS = {
    "mysql": fetch_mysql_detail,
    "redis": fetch_redis_detail,
    "postgresql": fetch_pg_detail,
}


# =====================================================================
# 拓扑关系查询 — 统一返回 schema
# =====================================================================
# Schema:
# {
#     "nodes": [
#         {
#             "id": "instance_<pk>",         # 唯一标识
#             "instance_id": <pk>,            # 数据库实例 ID
#             "name": "mysql-master",         # 实例名称
#             "type": "mysql",                # 数据库类型
#             "role": "master",               # 角色：master / slave / replica / standalone
#             "host": "192.168.1.10",         # 主机地址
#             "port": 3306,                   # 端口
#             "status": 0,                    # 实例状态
#             "version": "8.0.30",            # 版本号
#         },
#         ...
#     ],
#     "edges": [
#         {
#             "source": "instance_1",         # 源节点 ID（主库）
#             "target": "instance_2",         # 目标节点 ID（从库）
#             "label": "复制",                # 关系标签
#             "status": "running",            # 复制状态：running / stopped / error
#             "delay": 0,                     # 复制延迟（秒）
#         },
#         ...
#     ]
# }
# =====================================================================

def fetch_mysql_replication(host, port, username, password):
    if pymysql is None:
        raise ImportError("pymysql is not installed")

    result = {"role": "standalone", "slaves": [], "master": None}

    with pymysql.connect(host=host, port=int(port), user=username, password=password,
                         connect_timeout=5, charset='utf8mb4') as conn:
        with conn.cursor() as cursor:
            try:
                cursor.execute("SHOW MASTER STATUS")
                master_status = cursor.fetchone()
                if master_status:
                    result["role"] = "master"
                    result["master_status"] = {
                        "file": master_status[0],
                        "position": master_status[1],
                    }
            except Exception:
                pass

            try:
                cursor.execute("SHOW SLAVE STATUS")
                cols = [desc[0] for desc in cursor.description] if cursor.description else []
                slave_row = cursor.fetchone()
                if slave_row and cols:
                    slave_info = dict(zip(cols, slave_row))
                    master_host = slave_info.get("Master_Host", "")
                    master_port = slave_info.get("Master_Port", 3306)
                    io_running = slave_info.get("Slave_IO_Running", "No")
                    sql_running = slave_info.get("Slave_SQL_Running", "No")
                    seconds_behind = slave_info.get("Seconds_Behind_Master")

                    if master_host in ("localhost", "127.0.0.1", "0.0.0.0"):
                        master_host = host

                    result["role"] = "slave"
                    result["master_host"] = master_host
                    result["master_port"] = int(master_port) if master_port else 3306
                    result["replication_status"] = "running" if (io_running == "Yes" and sql_running == "Yes") else "stopped"
                    result["seconds_behind"] = int(seconds_behind) if seconds_behind is not None else None
                    result["io_running"] = io_running == "Yes"
                    result["sql_running"] = sql_running == "Yes"
            except Exception:
                pass

    return result


def fetch_redis_replication(host, port, username=None, password=None):
    if redis is None:
        raise ImportError("redis is not installed")

    conn_params = {"host": host, "port": int(port), "socket_connect_timeout": 5, "socket_timeout": 5, "decode_responses": True}
    if username and str(username).strip():
        conn_params["username"] = username
    if password and str(password).strip():
        conn_params["password"] = password

    client = redis.Redis(**conn_params)
    client.ping()

    result = {"role": "standalone", "slaves": [], "master": None}

    info = client.info("replication")
    role = info.get("role", "standalone")
    result["role"] = role

    if role == "master":
        connected_slaves = info.get("connected_slaves", 0)
        for i in range(connected_slaves):
            slave_key = f"slave{i}"
            slave_info = info.get(slave_key, "")
            if slave_info:
                parts = str(slave_info).split(",")
                slave_ip = parts[0].split("=")[1] if "=" in parts[0] else ""
                slave_port = parts[1].split("=")[1] if "=" in parts[1] else ""
                slave_state = parts[2].split("=")[1] if len(parts) > 2 and "=" in parts[2] else ""
                result["slaves"].append({
                    "host": slave_ip,
                    "port": int(slave_port) if slave_port else 0,
                    "state": slave_state,
                })
    elif role == "slave":
        result["master_host"] = info.get("master_host", "")
        result["master_port"] = info.get("master_port", 6379)
        result["master_link_status"] = info.get("master_link_status", "down")

    return result


REPLICATION_FETCHERS = {
    "mysql": fetch_mysql_replication,
    "redis": fetch_redis_replication,
}
