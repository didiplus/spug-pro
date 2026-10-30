"""SQL 执行函数 + 注册表"""
from .imports import pymysql, psycopg2, pymssql, clickhouse_connect, sqlite3_module


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