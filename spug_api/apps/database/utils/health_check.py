"""数据库实例健康检查 — 定时探测 + 手动触发"""
import logging
from django.db import close_old_connections
from apps.database.models import DatabaseInstance
from apps.database.utils import TEST_FETCHERS

logger = logging.getLogger(__name__)


def check_instance(instance):
    """检测单个实例连通性，返回 (is_online, version, latency_ms)"""
    fetcher = TEST_FETCHERS.get(instance.type)
    if not fetcher:
        return False, None, None
    try:
        result = fetcher(instance.host, instance.port, instance.username, instance.password)
        if isinstance(result, dict):
            if not result.get('success'):
                return False, None, None
            version = result.get('version')
            latency = result.get('latency')
        elif isinstance(result, tuple):
            version, latency = result[0], result[1] if len(result) > 1 else None
        else:
            version, latency = result, None
        if version:
            version = str(version)[:200]
        return True, version, latency
    except Exception as e:
        logger.debug(f"health check failed for {instance.name}: {e}")
        return False, None, None


def run_health_check():
    """批量健康检查所有实例 — 由 apscheduler 定时调用"""
    try:
        instances = list(DatabaseInstance.objects.all())
        updated = 0
        for inst in instances:
            is_online, version, _ = check_instance(inst)
            new_status = 0 if is_online else 1
            need_update = inst.status != new_status
            if version and version != inst.version:
                inst.version = version
                need_update = True
            if need_update:
                inst.status = new_status
                inst.save(update_fields=['status', 'version'])
                updated += 1
        logger.info(f"health check done: {len(instances)} instances, {updated} updated")
    except Exception as e:
        logger.error(f"health check error: {e}")
    finally:
        close_old_connections()