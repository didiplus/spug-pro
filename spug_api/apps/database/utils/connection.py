"""数据库连接测试函数 + 注册表"""
from .imports import pymysql, redis, psycopg2, MongoClient, pymssql, oracledb, sqlite3_module, clickhouse_connect, ESClient, CassandraCluster
from .common import timed_test


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


@timed_test
def test_connection_mariadb(host, port, username, password, database=None):
    if pymysql is None:
        raise ImportError("pymysql is not installed")
    with pymysql.connect(host=host, port=int(port), user=username, password=password, database=database or "mysql", connect_timeout=5) as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT VERSION()")
            return cursor.fetchone()[0]


@timed_test
def test_connection_tidb(host, port, username, password, database=None):
    if pymysql is None:
        raise ImportError("pymysql is not installed. TiDB is MySQL-compatible")
    with pymysql.connect(host=host, port=int(port), user=username, password=password, database=database or "test", connect_timeout=5) as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT VERSION()")
            return cursor.fetchone()[0]


@timed_test
def test_connection_mssql(host, port, username, password, database=None):
    if pymssql is None:
        raise ImportError("pymssql is not installed. Run: pip install pymssql")
    conn = pymssql.connect(server=host, port=int(port), user=username, password=password, database=database or "master", connect_timeout=5)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT @@VERSION")
            return cursor.fetchone()[0]
    finally:
        conn.close()


@timed_test
def test_connection_oracle(host, port, username, password, database=None):
    if oracledb is None:
        raise ImportError("oracledb is not installed. Run: pip install oracledb")
    dsn = f"{host}:{int(port)}/{database or 'ORCL'}"
    conn = oracledb.connect(user=username, password=password, dsn=dsn)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT BANNER FROM v$version WHERE ROWNUM = 1")
            return cursor.fetchone()[0]
    finally:
        conn.close()


@timed_test
def test_connection_sqlite(host, port, username, password, database=None):
    if sqlite3_module is None:
        raise ImportError("sqlite3 is not available")
    db_path = database or host
    conn = sqlite3_module.connect(db_path, timeout=5)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT sqlite_version()")
            return f"SQLite {cursor.fetchone()[0]}"
    finally:
        conn.close()


@timed_test
def test_connection_clickhouse(host, port, username, password, database=None):
    if clickhouse_connect is None:
        raise ImportError("clickhouse-connect is not installed. Run: pip install clickhouse-connect")
    client = clickhouse_connect.get_client(host=host, port=int(port), username=username or "default", password=password or "", database=database or "default", connect_timeout=5)
    version = client.server_version
    client.close()
    return version


@timed_test
def test_connection_es(host, port, username=None, password=None, database=None):
    if ESClient is None:
        raise ImportError("elasticsearch is not installed. Run: pip install elasticsearch")
    client = ESClient(hosts=[f"http://{host}:{int(port)}"], basic_auth=(username, password) if username else None, request_timeout=5)
    info = client.info()
    client.close()
    return info["version"]["number"]


@timed_test
def test_connection_cassandra(host, port, username=None, password=None, database=None):
    if CassandraCluster is None:
        raise ImportError("cassandra-driver is not installed. Run: pip install cassandra-driver")
    cluster = CassandraCluster([host], port=int(port), connect_timeout=5)
    session = cluster.connect()
    version = session.execute("SELECT release_version FROM system.local").one().release_version
    cluster.shutdown()
    return version


TEST_FETCHERS = {
    "mysql": test_connection_db,
    "mariadb": test_connection_mariadb,
    "redis": test_connection_redis,
    "postgresql": test_connection_pg,
    "tidb": test_connection_tidb,
    "mongodb": test_connection_mongo,
    "mssql": test_connection_mssql,
    "oracle": test_connection_oracle,
    "sqlite": test_connection_sqlite,
    "clickhouse": test_connection_clickhouse,
    "elasticsearch": test_connection_es,
    "cassandra": test_connection_cassandra,
}