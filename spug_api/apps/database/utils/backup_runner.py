"""保留策略清理 + 异步备份执行"""
import os
import logging
from datetime import datetime, timedelta

from django.db import close_old_connections

from .backup import BACKUP_CREATORS

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
