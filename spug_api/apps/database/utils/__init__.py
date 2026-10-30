"""
数据库管理工具包 — 按功能拆分

子模块:
  imports        - 可选数据库驱动导入
  common         - 公共工具（装饰器、格式化、常量）
  connection     - 连接测试 + TEST_FETCHERS
  detail         - 详情查询 + DETAIL_FETCHERS
  executor       - SQL 执行 + SQL_EXECUTORS
  slow_query     - 慢查询分析 + SLOW_QUERY_FETCHERS
  backup         - 备份创建 + BACKUP_CREATORS
  backup_runner  - 异步备份执行 + 保留策略清理
"""
from .common import timed_test, format_uptime, BACKUP_DIR
from .connection import TEST_FETCHERS
from .detail import DETAIL_FETCHERS
from .executor import SQL_EXECUTORS
from .slow_query import SLOW_QUERY_FETCHERS
from .backup import BACKUP_CREATORS
from .backup_runner import run_backup_async, cleanup_old_backups
from .topology import discover_topology, DISCOVERY_DISPATCH, auto_discover_clusters
from .health_check import run_health_check, check_instance

__all__ = [
    'timed_test',
    'format_uptime',
    'BACKUP_DIR',
    'TEST_FETCHERS',
    'DETAIL_FETCHERS',
    'SQL_EXECUTORS',
    'SLOW_QUERY_FETCHERS',
    'BACKUP_CREATORS',
    'run_backup_async',
    'cleanup_old_backups',
    'discover_topology',
    'DISCOVERY_DISPATCH',
    'auto_discover_clusters',
    'run_health_check',
    'check_instance',
]