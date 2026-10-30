"""数据库详情查询函数 + 注册表"""
from .imports import pymysql, redis, psycopg2, MongoClient, pymssql, oracledb, clickhouse_connect, ESClient, CassandraCluster
from .common import format_uptime


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
            {"key": "connections", "label": "连接数", "value": f"{sv.get('Threads_connected', 0)}/{sv.get('Max_used_connections', '-')}", "color": "warning", "icon": "api"},
            {"key": "qps", "label": "QPS", "value": sv.get('Queries', '0'), "color": "processing", "icon": "thunderbolt"},
            {"key": "slow_queries", "label": "慢查询", "value": sv.get('Slow_queries', '0'), "color": "error" if int(sv.get('Slow_queries', 0)) > 0 else "#52c41a", "icon": "clock"},
            {"key": "uptime", "label": "运行时长", "value": format_uptime(sv.get('Uptime', 0)), "color": "info", "icon": "clock"},
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
        {"name": "uptime", "value": format_uptime(server_info.get("uptime_in_seconds", 0))},
        {"name": "used_memory", "value": memory_info.get("used_memory_human", "")},
        {"name": "used_memory_peak", "value": memory_info.get("used_memory_peak_human", "")},
        {"name": "connected_clients", "value": clients_info.get("connected_clients", 0)},
        {"name": "total_commands", "value": stats_info.get("total_commands_processed", 0)},
        {"name": "ops_per_sec", "value": stats_info.get("instantaneous_ops_per_sec", 0)},
    ]

    return {
        "metrics": [
            {"key": "clients", "label": "连接客户端", "value": str(clients_info.get("connected_clients", 0)), "color": "warning", "icon": "api"},
            {"key": "ops", "label": "OPS", "value": str(stats_info.get("instantaneous_ops_per_sec", 0)), "color": "processing", "icon": "thunderbolt"},
            {"key": "memory", "label": "内存使用", "value": memory_info.get("used_memory_human", "-"), "color": "success", "icon": "database"},
            {"key": "uptime", "label": "运行时长", "value": format_uptime(server_info.get("uptime_in_seconds", 0)), "color": "info", "icon": "clock"},
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
            {"key": "active", "label": "活跃连接", "value": str(active), "color": "warning", "icon": "api"},
            {"key": "idle", "label": "空闲连接", "value": str(idle), "color": "default", "icon": "api"},
            {"key": "databases", "label": "数据库数", "value": str(len(db_rows)), "color": "info", "icon": "database"},
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
            {"key": "databases", "label": "数据库数", "value": str(len(db_rows)), "color": "info", "icon": "database"},
            {"key": "active_ops", "label": "活跃操作", "value": str(active_ops), "color": "warning", "icon": "api"},
            {"key": "version", "label": "版本", "value": server_version, "color": "success", "icon": "info"},
            {"key": "uptime", "label": "运行时长", "value": format_uptime(uptime), "color": "processing", "icon": "clock"},
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
            {"key": "connections", "label": "连接数", "value": str(conn_count), "color": "warning", "icon": "api"},
            {"key": "databases", "label": "数据库数", "value": str(len(db_rows)), "color": "info", "icon": "database"},
            {"key": "version", "label": "版本", "value": version, "color": "success", "icon": "info"},
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
            {"key": "active_sessions", "label": "活跃会话", "value": str(active_sessions), "color": "warning", "icon": "api"},
            {"key": "db_name", "label": "数据库名", "value": db_name, "color": "info", "icon": "database"},
            {"key": "version", "label": "版本", "value": version, "color": "success", "icon": "info"},
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
            {"key": "queries", "label": "当前查询数", "value": str(query_count), "color": "warning", "icon": "api"},
            {"key": "databases", "label": "数据库数", "value": str(len(db_rows)), "color": "info", "icon": "database"},
            {"key": "version", "label": "版本", "value": version, "color": "success", "icon": "info"},
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
            {"key": "indices", "label": "索引数", "value": str(total_indices), "color": "info", "icon": "database"},
            {"key": "status", "label": "集群状态", "value": status, "color": "error" if status == "red" else "#52c41a", "icon": "heart"},
            {"key": "version", "label": "版本", "value": version, "color": "processing", "icon": "info"},
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
            {"key": "keyspaces", "label": "Keyspace 数", "value": str(len(db_rows)), "color": "info", "icon": "database"},
            {"key": "version", "label": "版本", "value": version, "color": "success", "icon": "info"},
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