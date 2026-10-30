"""慢查询分析函数 + 注册表"""
from .imports import pymysql


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
            {"key": "slow_query_count", "label": "慢查询总数", "value": "0", "color": "error", "icon": "clock"},
            {"key": "avg_latency", "label": "平均耗时", "value": "0ms", "color": "warning", "icon": "clock"},
            {"key": "max_latency", "label": "最大耗时", "value": "0ms", "color": "danger", "icon": "clock"},
            {"key": "total_exec", "label": "总执行次数", "value": "0", "color": "primary", "icon": "api"},
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
                    {"key": "slow_query_count", "label": "慢查询总数", "value": str(len(rows)), "color": "error", "icon": "clock"},
                    {"key": "avg_latency", "label": "平均耗时", "value": f"{avg_latency}ms", "color": "warning", "icon": "clock"},
                    {"key": "max_latency", "label": "最大耗时", "value": f"{max_latency}ms", "color": "danger", "icon": "clock"},
                    {"key": "total_exec", "label": "总执行次数", "value": str(total_exec), "color": "primary", "icon": "api"},
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