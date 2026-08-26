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

try:
    import pymssql
except ImportError:
    pymssql = None

try:
    import oracledb
except ImportError:
    oracledb = None

try:
    import sqlite3 as sqlite3_module
except ImportError:
    sqlite3_module = None

try:
    import clickhouse_connect
except ImportError:
    clickhouse_connect = None

try:
    from elasticsearch import Elasticsearch as ESClient
except ImportError:
    ESClient = None

try:
    from cassandra.cluster import Cluster as CassandraCluster
except ImportError:
    CassandraCluster = None


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


def execute_postgresql_sql(host, port, username, password, sql, database=None, limit=1000):
    if psycopg2 is None:
        raise ImportError("psycopg2 is not installed")

    conn = psycopg2.connect(
        host=host, port=int(port),
        user=username, password=password,
        dbname=database or "postgres",
        connect_timeout=10,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            if cur.description:
                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchmany(limit)
                data = [dict(zip(columns, row)) for row in rows]
                return {
                    "columns": columns,
                    "rows": data,
                    "affected": cur.rowcount,
                    "truncated": cur.rowcount > limit,
                }
            else:
                conn.commit()
                return {
                    "columns": [],
                    "rows": [],
                    "affected": cur.rowcount,
                    "truncated": False,
                }
    finally:
        conn.close()


def execute_mssql_sql(host, port, username, password, sql, database=None, limit=1000):
    if pymssql is None:
        raise ImportError("pymssql is not installed")
    conn = pymssql.connect(server=host, port=int(port), user=username, password=password, database=database or "master", connect_timeout=10)
    try:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            if cursor.description:
                columns = [desc[0] for desc in cursor.description]
                rows = cursor.fetchmany(limit)
                data = [dict(zip(columns, row)) for row in rows]
                return {"columns": columns, "rows": data, "affected": cursor.rowcount, "truncated": cursor.rowcount > limit}
            else:
                conn.commit()
                return {"columns": [], "rows": [], "affected": cursor.rowcount, "truncated": False}
    finally:
        conn.close()


def execute_clickhouse_sql(host, port, username, password, sql, database=None, limit=1000):
    if clickhouse_connect is None:
        raise ImportError("clickhouse-connect is not installed")
    client = clickhouse_connect.get_client(host=host, port=int(port), username=username or "default", password=password or "", database=database or "default", connect_timeout=10)
    try:
        result = client.query(sql)
        columns = result.column_names
        rows = result.result_rows[:limit]
        data = [dict(zip(columns, row)) for row in rows]
        return {"columns": list(columns), "rows": data, "affected": len(rows), "truncated": len(result.result_rows) > limit}
    finally:
        client.close()


def execute_sqlite_sql(host, port, username, password, sql, database=None, limit=1000):
    if sqlite3_module is None:
        raise ImportError("sqlite3 is not available")
    db_path = database or host
    conn = sqlite3_module.connect(db_path, timeout=10)
    conn.row_factory = sqlite3_module.Row
    try:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            if cursor.description:
                columns = [desc[0] for desc in cursor.description]
                rows = cursor.fetchmany(limit)
                data = [dict(zip(columns, row)) for row in rows]
                return {"columns": columns, "rows": data, "affected": cursor.rowcount, "truncated": cursor.rowcount > limit}
            else:
                conn.commit()
                return {"columns": [], "rows": [], "affected": cursor.rowcount, "truncated": False}
    finally:
        conn.close()


SQL_EXECUTORS = {
    "mysql": execute_mysql_sql,
    "mariadb": execute_mysql_sql,
    "tidb": execute_mysql_sql,
    "postgresql": execute_postgresql_sql,
    "mssql": execute_mssql_sql,
    "clickhouse": execute_clickhouse_sql,
    "sqlite": execute_sqlite_sql,
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

    import tempfile
    defaults_file = None
    try:
        defaults_fd = tempfile.NamedTemporaryFile(mode='w', suffix='.cnf', delete=False)
        defaults_fd.write(f"[mysqldump]\nhost={instance.host}\nport={instance.port}\nuser={instance.username}\npassword={instance.password or ''}\n")
        defaults_fd.flush()
        defaults_fd.close()
        defaults_file = defaults_fd.name

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

        import tempfile
        rdb_fd = tempfile.NamedTemporaryFile(mode='wb', suffix='.rdb', delete=False)
        rdb_fd.close()
        rdb_path = rdb_fd.name

        cmd = ['redis-cli', '-h', instance.host, '-p', str(instance.port), '--rdb', rdb_path]
        if instance.password:
            cmd.extend(['-a', instance.password])
        if instance.username:
            cmd.extend(['--user', instance.username])

        proc = subprocess.run(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=3600,
        )
        if proc.returncode != 0:
            err_msg = proc.stderr.decode('utf-8', errors='replace')[:500]
            raise RuntimeError(f'redis-cli --rdb failed: {err_msg}')
        if not os.path.exists(rdb_path) or os.path.getsize(rdb_path) == 0:
            raise RuntimeError('redis-cli --rdb 导出文件为空')

        import gzip
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

    import tempfile as _tmp
    defaults_file = None
    try:
        fd = _tmp.NamedTemporaryFile(mode='w', suffix='.cnf', delete=False)
        fd.write(f"[mysqldump]\nhost={instance.host}\nport={instance.port}\nuser={instance.username}\npassword={instance.password or ''}\n")
        fd.flush()
        fd.close()
        defaults_file = fd.name
        cmd = ['mysqldump', f'--defaults-extra-file={defaults_file}', '--single-transaction', '--routines', '--triggers', '--events']
        cmd.append(database if database else '--all-databases')
        start = time.time()
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3600)
        if proc.returncode != 0:
            raise RuntimeError(f'mysqldump failed: {proc.stderr.decode("utf-8", errors="replace")[:500]}')
        import gzip
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

    import tempfile as _tmp
    defaults_file = None
    try:
        fd = _tmp.NamedTemporaryFile(mode='w', suffix='.cnf', delete=False)
        fd.write(f"[mysqldump]\nhost={instance.host}\nport={instance.port}\nuser={instance.username}\npassword={instance.password or ''}\n")
        fd.flush()
        fd.close()
        defaults_file = fd.name
        cmd = ['mysqldump', f'--defaults-extra-file={defaults_file}', '--single-transaction', '--routines', '--triggers']
        cmd.append(database if database else '--all-databases')
        start = time.time()
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3600)
        if proc.returncode != 0:
            raise RuntimeError(f'mysqldump failed: {proc.stderr.decode("utf-8", errors="replace")[:500]}')
        import gzip
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
    dump_name = f"dump_{ts}"

    env = os.environ.copy()
    start = time.time()
    try:
        cmd = [
            'expdp',
            f'{instance.username}/{instance.password}@{instance.host}:{instance.port}/{db_name}',
            f'DUMPFILE={filename}',
            f'DIRECTORY=DATA_PUMP_DIR',
            f'DUMPFILE={filename}',
            'COMPRESSION=ALL',
        ]
        if database:
            cmd.append(f'SCHEMAS={database}')
        else:
            cmd.append('FULL=Y')
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
            conn.execute(f"VACUUM INTO '{filepath}'")
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
        import gzip
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


# =====================================================================
# 保留策略 & 异步备份执行
# =====================================================================
import logging
from datetime import datetime, timedelta
from django.db import close_old_connections

logger = logging.getLogger(__name__)


def cleanup_old_backups(instance):
    """根据保留策略清理旧备份，返回删除数量"""
    from apps.database.models import RetentionPolicy, DatabaseBackup

    policies = RetentionPolicy.objects.filter(instance=instance, enabled=True)
    if not policies.exists():
        return 0

    policy = policies.first()
    backups = DatabaseBackup.objects.filter(instance=instance, status='success').order_by('-id')
    to_delete_ids = []

    if policy.strategy_type == 'count':
        keep = policy.keep_count or 30
        for b in backups[keep:]:
            to_delete_ids.append(b.id)

    elif policy.strategy_type == 'time':
        keep_days = policy.keep_days or 7
        cutoff = datetime.now() - timedelta(days=keep_days)
        cutoff_str = cutoff.strftime('%Y-%m-%d %H:%M:%S')
        for b in backups:
            if b.created_at < cutoff_str:
                to_delete_ids.append(b.id)

    elif policy.strategy_type == 'gfs':
        daily_keep = policy.keep_days or 7
        weekly_keep = policy.keep_weekly or 4
        monthly_keep = policy.keep_monthly or 12
        now = datetime.now()
        kept_ids = set()
        daily_cutoff = now - timedelta(days=daily_keep)
        for b in backups:
            try:
                bt = datetime.strptime(b.created_at, '%Y-%m-%d %H:%M:%S')
            except (ValueError, TypeError):
                continue
            if bt >= daily_cutoff:
                kept_ids.add(b.id)
        weekly_backups = {}
        for b in backups:
            if b.id in kept_ids:
                continue
            try:
                bt = datetime.strptime(b.created_at, '%Y-%m-%d %H:%M:%S')
            except (ValueError, TypeError):
                continue
            week_key = bt.strftime('%Y-W%W')
            if week_key not in weekly_backups:
                weekly_backups[week_key] = b
        weekly_cutoff = now - timedelta(weeks=weekly_keep)
        for wk, b in weekly_backups.items():
            try:
                bt = datetime.strptime(b.created_at, '%Y-%m-%d %H:%M:%S')
            except (ValueError, TypeError):
                continue
            if bt >= weekly_cutoff:
                kept_ids.add(b.id)
        monthly_backups = {}
        for b in backups:
            if b.id in kept_ids:
                continue
            try:
                bt = datetime.strptime(b.created_at, '%Y-%m-%d %H:%M:%S')
            except (ValueError, TypeError):
                continue
            month_key = bt.strftime('%Y-%m')
            if month_key not in monthly_backups:
                monthly_backups[month_key] = b
        monthly_cutoff = now - timedelta(days=monthly_keep * 30)
        for mk, b in monthly_backups.items():
            try:
                bt = datetime.strptime(b.created_at, '%Y-%m-%d %H:%M:%S')
            except (ValueError, TypeError):
                continue
            if bt >= monthly_cutoff:
                kept_ids.add(b.id)
        for b in backups:
            if b.id not in kept_ids:
                to_delete_ids.append(b.id)

    deleted = 0
    for b in backups:
        if b.id in to_delete_ids:
            if b.file_path and os.path.exists(b.file_path):
                try:
                    os.remove(b.file_path)
                except OSError:
                    pass
            if b.remote_path and b.storage_config and b.storage_config.enabled:
                try:
                    from apps.setting.storage_backends import delete_from_remote, build_config_from_model
                    config = build_config_from_model(b.storage_config)
                    delete_from_remote(config, b.remote_path)
                except Exception as e:
                    logger.warning(f"远程删除失败: backup_id={b.id}, error={e}")
            b.delete()
            deleted += 1

    logger.info(f"保留策略清理完成: instance={instance.name}, deleted={deleted}")
    return deleted


def run_backup_async(backup_id):
    """异步执行备份任务，在独立线程中调用"""
    from apps.database.models import DatabaseBackup, RetentionPolicy
    from apps.setting.models import StorageConfig

    try:
        backup = DatabaseBackup.objects.get(pk=backup_id)
        instance = backup.instance
        creator = BACKUP_CREATORS.get(instance.type)
        if not creator:
            backup.status = 'failed'
            backup.error_message = f'Unsupported type: {instance.type}'
            backup.save()
            return

        backup.status = 'running'
        backup.progress = 10
        backup.save()

        filepath, file_size, duration = creator(instance, database=backup.database)

        backup.file_path = filepath
        backup.file_size = file_size
        backup.duration = duration
        backup.status = 'success'
        backup.progress = 80
        backup.save()

        if backup.storage_config and backup.storage_config.enabled:
            try:
                from apps.setting.storage_backends import upload_to_remote, build_config_from_model
                config = build_config_from_model(backup.storage_config)
                remote_key, remote_uri = upload_to_remote(config, filepath)
                backup.remote_path = remote_key
                backup.storage_status = 'uploaded'
                backup.progress = 100
                backup.save()
            except Exception as upload_err:
                logger.error(f"S3 upload failed: backup_id={backup_id}, error={upload_err}")
                backup.storage_status = 'upload_failed'
                backup.error_message = f'本地备份成功但远程上传失败: {str(upload_err)[:300]}'
                backup.progress = 100
                backup.save()
        else:
            backup.progress = 100
            backup.save()

        if RetentionPolicy.objects.filter(instance=instance, enabled=True, auto_cleanup=True).exists():
            cleanup_old_backups(instance)

    except Exception as e:
        logger.error(f"异步备份失败: backup_id={backup_id}, error={e}")
        try:
            backup = DatabaseBackup.objects.get(pk=backup_id)
            backup.status = 'failed'
            backup.error_message = str(e)[:500]
            backup.progress = 0
            backup.save()
        except Exception:
            pass
    finally:
        close_old_connections()


def fetch_mongo_detail(host, port, username=None, password=None):
    if MongoClient is None:
        raise ImportError("pymongo is not installed")

    client = MongoClient(host=host, port=int(port), username=username, password=password,
                         authSource="admin", connectTimeoutMS=5000, serverSelectionTimeoutMS=5000)
    try:
        server_info = client.admin.command("serverStatus")
        server_version = server_info.get("version", "unknown")
        uptime = server_info.get("uptime", 0)

        db_rows = []
        for db_name in client.list_database_names():
            if db_name in ("admin", "local", "config"):
                continue
            try:
                coll_count = len(client[db_name].list_collection_names())
            except Exception:
                coll_count = 0
            db_rows.append({"name": db_name, "collections": coll_count})

        conn_info = client.admin.command("currentOp", True) or {}
        active_ops = sum(1 for op in conn_info.get("inprog", []) if op.get("active"))
    finally:
        client.close()

    return {
        "metrics": [
            {"key": "databases", "label": "数据库数", "value": str(len(db_rows)), "color": "#1890ff", "icon": "database"},
            {"key": "active_ops", "label": "活跃操作", "value": str(active_ops), "color": "#fa8c16", "icon": "api"},
            {"key": "version", "label": "版本", "value": server_version, "color": "#52c41a", "icon": "info"},
            {"key": "uptime", "label": "运行时长", "value": _format_uptime(uptime), "color": "#722ed1", "icon": "clock"},
        ],
        "databases": {
            "columns": [
                {"key": "name", "title": "数据库名", "width": 200},
                {"key": "collections", "title": "集合数", "width": 120},
            ],
            "rows": db_rows,
        },
        "processes": None,
        "variables": None,
    }


def fetch_mssql_detail(host, port, username, password, database=None):
    if pymssql is None:
        raise ImportError("pymssql is not installed")
    conn = pymssql.connect(server=host, port=int(port), user=username, password=password, database=database or "master", connect_timeout=5)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT @@VERSION")
            version = cursor.fetchone()[0].split("\n")[0]
            cursor.execute("SELECT name FROM sys.databases WHERE state = 0")
            db_rows = [{"name": row[0]} for row in cursor.fetchall()]
            cursor.execute("SELECT COUNT(*) FROM sys.dm_exec_connections")
            conn_count = cursor.fetchone()[0]
    finally:
        conn.close()
    return {
        "metrics": [
            {"key": "connections", "label": "连接数", "value": str(conn_count), "color": "#fa8c16", "icon": "api"},
            {"key": "databases", "label": "数据库数", "value": str(len(db_rows)), "color": "#1890ff", "icon": "database"},
            {"key": "version", "label": "版本", "value": version, "color": "#52c41a", "icon": "info"},
        ],
        "databases": {"columns": [{"key": "name", "title": "数据库名", "width": 250}], "rows": db_rows},
        "processes": None, "variables": None,
    }


def fetch_oracle_detail(host, port, username, password, database=None):
    if oracledb is None:
        raise ImportError("oracledb is not installed")
    dsn = f"{host}:{int(port)}/{database or 'ORCL'}"
    conn = oracledb.connect(user=username, password=password, dsn=dsn)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT BANNER FROM v$version WHERE ROWNUM = 1")
            version = cursor.fetchone()[0]
            cursor.execute("SELECT name FROM v$database")
            db_name = cursor.fetchone()[0]
            cursor.execute("SELECT COUNT(*) FROM v$session WHERE status = 'ACTIVE'")
            active_sessions = cursor.fetchone()[0]
    finally:
        conn.close()
    return {
        "metrics": [
            {"key": "active_sessions", "label": "活跃会话", "value": str(active_sessions), "color": "#fa8c16", "icon": "api"},
            {"key": "db_name", "label": "数据库名", "value": db_name, "color": "#1890ff", "icon": "database"},
            {"key": "version", "label": "版本", "value": version, "color": "#52c41a", "icon": "info"},
        ],
        "databases": {"columns": [{"key": "name", "title": "数据库名", "width": 250}], "rows": [{"name": db_name}]},
        "processes": None, "variables": None,
    }


def fetch_clickhouse_detail(host, port, username, password, database=None):
    if clickhouse_connect is None:
        raise ImportError("clickhouse-connect is not installed")
    client = clickhouse_connect.get_client(host=host, port=int(port), username=username or "default", password=password or "", database=database or "default", connect_timeout=5)
    try:
        version = client.server_version
        result = client.query("SELECT name FROM system.databases")
        db_rows = [{"name": row[0]} for row in result.result_rows]
        result2 = client.query("SELECT value FROM system.metrics WHERE metric = 'Query'")
        query_count = result2.result_rows[0][0] if result2.result_rows else 0
    finally:
        client.close()
    return {
        "metrics": [
            {"key": "queries", "label": "当前查询数", "value": str(query_count), "color": "#fa8c16", "icon": "api"},
            {"key": "databases", "label": "数据库数", "value": str(len(db_rows)), "color": "#1890ff", "icon": "database"},
            {"key": "version", "label": "版本", "value": version, "color": "#52c41a", "icon": "info"},
        ],
        "databases": {"columns": [{"key": "name", "title": "数据库名", "width": 250}], "rows": db_rows},
        "processes": None, "variables": None,
    }


def fetch_es_detail(host, port, username=None, password=None):
    if ESClient is None:
        raise ImportError("elasticsearch is not installed")
    client = ESClient(hosts=[f"http://{host}:{int(port)}"], basic_auth=(username, password) if username else None, request_timeout=5)
    try:
        info = client.info()
        version = info["version"]["number"]
        stats = client.indices.stats(index="_all")
        total_indices = len(stats["indices"]) if "indices" in stats else 0
        health = client.cluster.health()
        status = health["status"]
    finally:
        client.close()
    return {
        "metrics": [
            {"key": "indices", "label": "索引数", "value": str(total_indices), "color": "#1890ff", "icon": "database"},
            {"key": "status", "label": "集群状态", "value": status, "color": "#cf1322" if status == "red" else "#52c41a", "icon": "heart"},
            {"key": "version", "label": "版本", "value": version, "color": "#722ed1", "icon": "info"},
        ],
        "databases": {"columns": [{"key": "name", "title": "索引名", "width": 250}], "rows": []},
        "processes": None, "variables": None,
    }


def fetch_cassandra_detail(host, port, username=None, password=None):
    if CassandraCluster is None:
        raise ImportError("cassandra-driver is not installed")
    cluster = CassandraCluster([host], port=int(port), connect_timeout=5)
    session = cluster.connect()
    try:
        version = session.execute("SELECT release_version FROM system.local").one().release_version
        result = session.execute("SELECT keyspace_name FROM system_schema.keyspaces")
        db_rows = [{"name": row.keyspace_name} for row in result]
    finally:
        cluster.shutdown()
    return {
        "metrics": [
            {"key": "keyspaces", "label": "Keyspace 数", "value": str(len(db_rows)), "color": "#1890ff", "icon": "database"},
            {"key": "version", "label": "版本", "value": version, "color": "#52c41a", "icon": "info"},
        ],
        "databases": {"columns": [{"key": "name", "title": "Keyspace", "width": 250}], "rows": db_rows},
        "processes": None, "variables": None,
    }


DETAIL_FETCHERS = {
    "mysql": fetch_mysql_detail,
    "mariadb": fetch_mysql_detail,
    "redis": fetch_redis_detail,
    "postgresql": fetch_pg_detail,
    "tidb": fetch_mysql_detail,
    "mongodb": fetch_mongo_detail,
    "mssql": fetch_mssql_detail,
    "oracle": fetch_oracle_detail,
    "clickhouse": fetch_clickhouse_detail,
    "elasticsearch": fetch_es_detail,
    "cassandra": fetch_cassandra_detail,
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
