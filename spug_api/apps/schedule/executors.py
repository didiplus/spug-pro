# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from libs.ssh import AuthenticationException
from django.db import close_old_connections, transaction
from django.conf import settings
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



def inspect_executor(command, created_by_id=None):
    from apps.exec.models import InspectTask, InspectResult, InspectItem
    from apps.exec.inspect import build_combined_script
    from apps.host.models import Host
    from django_redis import get_redis_connection
    from libs import human_datetime
    import uuid

    code, out, now = 1, None, time.time()
    try:
        data = json.loads(command)
        task_id = data['inspect_task_id']
        task = InspectTask.objects.filter(pk=task_id).first()
        if not task:
            return 1, round(time.time() - now, 3), f'巡检任务 {task_id} 不存在'

        host_ids = json.loads(task.host_ids)
        item_ids = json.loads(task.item_ids)
        if not host_ids:
            return 1, round(time.time() - now, 3), '未配置目标主机'
        if not item_ids:
            return 1, round(time.time() - now, 3), '未关联巡检项'

        token = uuid.uuid4().hex
        batch_id = uuid.uuid4().hex
        rds = get_redis_connection()
        run_at = human_datetime()
        items = list(InspectItem.objects.filter(id__in=item_ids, is_active=True).order_by('id'))
        if not items:
            return 1, round(time.time() - now, 3), '无可用巡检项'

        InspectResult.objects.filter(task_id=task.id, status='running').update(
            status='error', output='执行被中断（定时任务触发新执行）'
        )

        for host in Host.objects.filter(id__in=host_ids):
            for item in items:
                InspectResult.objects.create(
                    task_id=task.id,
                    batch_id=batch_id,
                    host_id=host.id,
                    item_id=item.id,
                    item_name=item.name,
                    status='running',
                    run_at=run_at,
                )
            combined_command = build_combined_script(items)
            dispatch_data = dict(
                key=host.id,
                name=host.name,
                token=token,
                interpreter='sh',
                hostname=host.hostname,
                port=host.port,
                username=host.username,
                command=combined_command,
                pkey=host.private_key,
                term=None,
                inspect_task_id=task.id,
                inspect_batch_id=batch_id,
                inspect_item_ids=[item.id for item in items],
            )
            rds.rpush(settings.EXEC_WORKER_KEY, json.dumps(dispatch_data))

        code = 0
        out = f'巡检任务 "{task.name}" 已触发，批次: {batch_id[:8]}'
    except Exception as e:
        out = f'inspect_executor error: {str(e)}'
    return code, round(time.time() - now, 3), out


def dispatch_job(host_id, interpreter, command, created_by_id=None):
    if interpreter == 'inspect':
        return inspect_executor(command, created_by_id=created_by_id)
    if interpreter == 'db_backup':
        from apps.database.utils.backup_runner import run_scheduled_backup
        return run_scheduled_backup(command, created_by_id=created_by_id)
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
