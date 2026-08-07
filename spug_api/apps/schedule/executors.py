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
    from apps.database.models import DatabaseInstance, DatabaseBackup
    from apps.database.utils import BACKUP_CREATORS
    from apps.account.models import User

    code, out, now = 1, None, time.time()
    try:
        config = json.loads(command)
        instance_id = config.get('instance_id')
        database = config.get('database') or None
        mode = config.get('mode', 'full')

        instance = DatabaseInstance.objects.filter(pk=instance_id).first()
        if not instance:
            return 1, round(time.time() - now, 3), f'Database instance {instance_id} not found'

        creator = BACKUP_CREATORS.get(instance.type)
        if not creator:
            return 1, round(time.time() - now, 3), f'Backup not supported for type: {instance.type}'

        created_by = User.objects.filter(pk=created_by_id).first() if created_by_id else None

        with transaction.atomic():
            backup = DatabaseBackup.objects.create(
                instance=instance,
                database=database,
                mode=mode,
                status='running',
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
                backup.save()
            code = 0
            out = f'备份成功: {filepath} ({file_size} bytes, {duration}ms)'
        except Exception as e:
            try:
                with transaction.atomic():
                    backup = DatabaseBackup.objects.get(pk=backup_id)
                    backup.status = 'failed'
                    backup.error_message = str(e)[:500]
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


def playbook_executor(playbook_id, host_id, extra_vars_str, created_by_id=None):
    """通过定时任务触发 Playbook 执行"""
    now = time.time()
    try:
        from apps.playbook.models import Playbook, PlaybookRun
        from apps.playbook.runner import build_dynamic_inventory
        from libs.execution.ansible_executor import AnsibleExecutor
        from apps.setting.utils import AppSetting

        playbook = Playbook.objects.filter(pk=playbook_id, is_active=True).first()
        if not playbook:
            return 1, round(time.time() - now, 3), f'Playbook {playbook_id} 不存在或已停用'

        host_ids = []
        if host_id != 'local':
            host = Host.objects.filter(pk=host_id).first()
            if host:
                host_ids = [host.id]
            else:
                return 1, round(time.time() - now, 3), f'未知主机: {host_id}'
        else:
            try:
                host_ids = json.loads(extra_vars_str) if extra_vars_str else []
            except (json.JSONDecodeError, TypeError):
                host_ids = []

        if not host_ids:
            return 1, round(time.time() - now, 3), '未指定目标主机'

        try:
            extra_vars = json.loads(extra_vars_str) if extra_vars_str else {}
        except (json.JSONDecodeError, TypeError):
            extra_vars = {}

        inventory = build_dynamic_inventory(host_ids, playbook.group_id)
        hosts = list(Host.objects.filter(id__in=host_ids))

        executor = AnsibleExecutor(hosts[0].hostname, hosts[0].port or 22, hosts[0].username)
        output_parts = []
        final_code = -1

        with executor:
            from apps.playbook.runner import _write_pkey_files
            _write_pkey_files(inventory, hosts, executor._tmpdir)
            executor.set_inventory(inventory)
            forks = playbook.forks or AppSetting.get_default('ansible_forks', 20)
            for code, output in executor.exec_playbook(playbook.content, extra_vars=extra_vars, forks=forks):
                if output:
                    output_parts.append(output)
                if code != -1:
                    final_code = code

        if final_code == -1:
            final_code = 1

        return final_code, round(time.time() - now, 3), ''.join(output_parts)

    except Exception as e:
        return 1, round(time.time() - now, 3), f'Playbook 执行异常: {e}'


def schedule_worker_handler(job):
    history_id, host_id, interpreter, command = json.loads(job)
    close_old_connections()
    created_by_id = None
    playbook_id = None
    history_obj = History.objects.filter(pk=history_id).first()
    if history_obj:
        task_obj = Task.objects.filter(pk=history_obj.task_id).first()
        if task_obj:
            created_by_id = task_obj.created_by_id
            playbook_id = task_obj.playbook_id

    if playbook_id:
        code, duration, out = playbook_executor(playbook_id, host_id, command, created_by_id)
    else:
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
