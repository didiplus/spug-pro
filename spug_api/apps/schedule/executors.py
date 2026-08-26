# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from libs.ssh import AuthenticationException
from django.db import close_old_connections, transaction
from apps.host.models import Host
from apps.schedule.models import History, Task
from apps.schedule.utils import send_fail_notify
import subprocess
import socket
import time
import json


def local_executor(command):
    code, out, now = 1, None, time.time()
    task = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        code = task.wait(3600)
        out = task.stdout.read() + task.stderr.read()
        out = out.decode()
    except subprocess.TimeoutExpired:
        out = 'timeout, wait more than 1 hour'
    return code, round(time.time() - now, 3), out


def host_executor(host, command):
    code, out, now = 1, None, time.time()
    try:
        with host.get_ssh() as ssh:
            code, out = ssh.exec_command_raw(command)
    except AuthenticationException:
        out = 'ssh authentication fail'
    except socket.error as e:
        out = f'network error {e}'
    return code, round(time.time() - now, 3), out


def db_backup_executor(command, created_by_id=None):
    from apps.database.models import DatabaseInstance, DatabaseBackup, RetentionPolicy
    from apps.setting.models import StorageConfig
    from apps.database.utils import BACKUP_CREATORS, cleanup_old_backups
    from apps.account.models import User
    import uuid

    code, out, now = 1, None, time.time()
    try:
        config = json.loads(command)
        instance_id = config.get('instance_id')
        database = config.get('database') or None
        mode = config.get('mode', 'full')
        storage_config_id = config.get('storage_config_id')

        instance = DatabaseInstance.objects.filter(pk=instance_id).first()
        if not instance:
            return 1, round(time.time() - now, 3), f'Database instance {instance_id} not found'

        creator = BACKUP_CREATORS.get(instance.type)
        if not creator:
            return 1, round(time.time() - now, 3), f'Backup not supported for type: {instance.type}'

        created_by = User.objects.filter(pk=created_by_id).first() if created_by_id else None
        task_id = uuid.uuid4().hex
        storage_config = None
        if storage_config_id:
            storage_config = StorageConfig.objects.filter(pk=storage_config_id, enabled=True).first()

        with transaction.atomic():
            backup = DatabaseBackup.objects.create(
                instance=instance,
                database=database,
                mode=mode,
                status='running',
                progress=10,
                task_id=task_id,
                storage_config=storage_config,
                remark='定时任务自动备份',
                created_by=created_by,
            )
            backup_id = backup.id

        try:
            filepath, file_size, duration = creator(instance, database=database)
            with transaction.atomic():
                backup = DatabaseBackup.objects.get(pk=backup_id)
                backup.file_path = filepath
                backup.file_size = file_size
                backup.duration = duration
                backup.status = 'success'
                backup.progress = 80
                backup.save()

            upload_msg = ''
            if storage_config:
                try:
                    from apps.setting.storage_backends import upload_to_remote, build_config_from_model
                    s3_config = build_config_from_model(storage_config)
                    remote_key, remote_uri = upload_to_remote(s3_config, filepath)
                    with transaction.atomic():
                        backup = DatabaseBackup.objects.get(pk=backup_id)
                        backup.remote_path = remote_key
                        backup.storage_status = 'uploaded'
                        backup.progress = 100
                        backup.save()
                    upload_msg = f', 已上传至 {remote_uri}'
                except Exception as upload_err:
                    with transaction.atomic():
                        backup = DatabaseBackup.objects.get(pk=backup_id)
                        backup.storage_status = 'upload_failed'
                        backup.error_message = f'远程上传失败: {str(upload_err)[:300]}'
                        backup.progress = 100
                        backup.save()
                    upload_msg = f', 远程上传失败: {str(upload_err)}'
            else:
                with transaction.atomic():
                    backup = DatabaseBackup.objects.get(pk=backup_id)
                    backup.progress = 100
                    backup.save()

            cleanup_msg = ''
            if RetentionPolicy.objects.filter(instance=instance, enabled=True, auto_cleanup=True).exists():
                deleted = cleanup_old_backups(instance)
                cleanup_msg = f', 保留策略清理: {deleted} 个旧备份已删除'

            out = f'备份成功: {filepath} ({file_size} bytes, {duration}ms){upload_msg}{cleanup_msg}'
            code = 0
        except Exception as e:
            try:
                with transaction.atomic():
                    backup = DatabaseBackup.objects.get(pk=backup_id)
                    backup.status = 'failed'
                    backup.error_message = str(e)[:500]
                    backup.progress = 0
                    backup.save()
            except Exception:
                pass
            out = f'备份失败: {str(e)}'
    except Exception as e:
        out = f'db_backup_executor error: {str(e)}'
    return code, round(time.time() - now, 3), out


def dispatch_job(host_id, interpreter, command, created_by_id=None):
    if interpreter == 'db_backup':
        return db_backup_executor(command, created_by_id=created_by_id)
    if interpreter == 'python':
        attach = 'INTERPRETER=python\ncommand -v python3 &> /dev/null && INTERPRETER=python3'
        command = f'{attach}\n$INTERPRETER << EOF\n# -*- coding: UTF-8 -*-\n{command}\nEOF'
    if host_id == 'local':
        code, duration, out = local_executor(command)
    else:
        host = Host.objects.filter(pk=host_id).first()
        if not host:
            code, duration, out = 1, 0, f'unknown host id for {host_id!r}'
        else:
            code, duration, out = host_executor(host, command)
    return code, duration, out


def schedule_worker_handler(job):
    history_id, host_id, interpreter, command = json.loads(job)
    close_old_connections()
    created_by_id = None
    history_obj = History.objects.filter(pk=history_id).first()
    if history_obj:
        task_obj = Task.objects.filter(pk=history_obj.task_id).first()
        if task_obj:
            created_by_id = task_obj.created_by_id

    code, duration, out = dispatch_job(host_id, interpreter, command, created_by_id=created_by_id)

    close_old_connections()
    with transaction.atomic():
        history = History.objects.select_for_update().get(pk=history_id)
        output = json.loads(history.output)
        output[str(host_id)] = [code, duration, out]
        history.output = json.dumps(output)
        if all(output.values()):
            history.status = '1' if sum(x[0] for x in output.values()) == 0 else '2'
        history.save()
    if history.status == '2':
        task = Task.objects.get(pk=history.task_id)
        send_fail_notify(task)
