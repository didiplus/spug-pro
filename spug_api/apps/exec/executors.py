# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django_redis import get_redis_connection
from libs.utils import human_seconds_time
from libs.execution.factory import ExecutorFactory
import threading
import socket
import json
import time
import logging

logger = logging.getLogger(__name__)



def exec_worker_handler(job):
    job = Job(**json.loads(job))
    threading.Thread(target=job.run).start()


class Job:
    def __init__(self, key, name, hostname, port, username, pkey, command, interpreter, params=None, token=None,
                 term=None, inspect_task_id=None):
        self.ssh = ExecutorFactory.create(hostname, port, username, pkey, term=term)
        self.key = key
        self.command = self._handle_command(command, interpreter)
        self.token = token
        self.inspect_task_id = inspect_task_id
        self._output_parts = []
        self.rds = get_redis_connection()
        self.env = dict(
            SPUG_HOST_ID=str(self.key),
            SPUG_HOST_NAME=name,
            SPUG_HOST_HOSTNAME=hostname,
            SPUG_SSH_PORT=str(port),
            SPUG_SSH_USERNAME=username,
            SPUG_INTERPRETER=interpreter
        )
        if isinstance(params, dict):
            self.env.update({f'_SPUG_{k}': str(v) for k, v in params.items()})

    def _send(self, message):
        self.rds.publish(self.token, json.dumps(message))

    def _handle_command(self, command, interpreter):
        if interpreter == 'python':
            attach = 'INTERPRETER=python\ncommand -v python3 &> /dev/null && INTERPRETER=python3'
            return f'{attach}\n$INTERPRETER << EOF\n# -*- coding: UTF-8 -*-\n{command}\nEOF'
        return command

    def send(self, data):
        self._send({'key': self.key, 'data': data})
        if self.inspect_task_id:
            self._output_parts.append(data)

    def send_status(self, code):
        self._send({'key': self.key, 'status': code})
        if self.inspect_task_id:
            try:
                from django.db import connections
                for conn in connections.all():
                    try:
                        conn.ensure_connection()
                    except Exception:
                        conn.connect()
                from apps.exec.models import InspectResult, InspectTask
                result = InspectResult.objects.filter(
                    task_id=self.inspect_task_id, host_id=self.key
                ).order_by('-id').first()
                if result:
                    task = InspectTask.objects.filter(pk=self.inspect_task_id).first()
                    rule = json.loads(task.rule) if task else {}
                    status = self._judge_status(code, rule)
                    result.status = status
                    result.exit_code = code
                    result.duration = int(time.time() - self._start_time) if hasattr(self, '_start_time') else 0
                    if self._output_parts:
                        import re
                        raw = ''.join(self._output_parts)
                        result.output = re.sub(r'\x1b\[[0-9;]*m', '', raw)
                    result.save()
                    logger.warning(f'Inspect result updated: task={self.inspect_task_id} host={self.key} status={status} exit_code={code}')
                    connections.close_all()
                    self._try_send_notify(task)
                else:
                    logger.warning(f'Inspect result not found: task={self.inspect_task_id} host={self.key}')
            except Exception as e:
                logger.warning(f'Inspect result update failed: {e}')
                try:
                    connections.close_all()
                except Exception:
                    pass

    def _try_send_notify(self, task):
        try:
            from apps.exec.models import InspectResult
            notify_grp = json.loads(task.notify_grp) if task.notify_grp else []
            notify_mode = json.loads(task.notify_mode) if task.notify_mode else []
            if not notify_grp or not notify_mode:
                return
            pending_count = InspectResult.objects.filter(
                task_id=task.id, status__in=['pending', 'running']
            ).count()
            if pending_count > 0:
                return
            results = InspectResult.objects.filter(task_id=task.id)
            total = results.count()
            success = results.filter(status='success').count()
            warning = results.filter(status='warning').count()
            error = results.filter(status='error').count()
            from apps.host.models import Host
            error_hosts = []
            for r in results.filter(status__in=['error', 'warning']):
                host = Host.objects.filter(pk=r.host_id).first()
                error_hosts.append(f"{host.name if host else str(r.host_id)}({r.status})")
            has_issue = warning > 0 or error > 0
            if has_issue:
                event = '1'
                title = f'[巡检告警] {task.name}'
            else:
                event = '2'
                title = f'[巡检正常] {task.name}'
            lines = [
                f'巡检任务: {task.name}',
                f'执行结果: 正常 {success}/{total}',
            ]
            if warning > 0:
                lines.append(f'告警: {warning}/{total}')
            if error > 0:
                lines.append(f'失败: {error}/{total}')
            if error_hosts:
                lines.append(f'异常主机: {", ".join(error_hosts)}')
            message = '\n'.join(lines)
            from libs.spug import Notification
            notify = Notification(notify_grp, event, task.name, title, message, None)
            notify.dispatch_monitor(notify_mode)
            logger.warning(f'Inspect notify sent: task={task.id} title={title}')
        except Exception as e:
            logger.warning(f'Inspect notify failed: {e}')

    @staticmethod
    def _judge_status(exit_code, rule):
        rule_type = rule.get('type', 'exit_code')
        if rule_type == 'exit_code':
            if exit_code in rule.get('exit_codes', [0]):
                return 'success'
            return 'error'
        return 'success' if exit_code == 0 else 'error'

    def run(self):
        if not self.token:
            with self.ssh:
                return self.ssh.exec_command(self.command, self.env)
        flag = time.time()
        self._start_time = flag
        self.send('\r\n\x1b[36m### Executing ...\x1b[0m\r\n')
        code = -1
        try:
            with self.ssh:
                for code, out in self.ssh.exec_command_with_stream(self.command, self.env):
                    self.send(out)
            human_time = human_seconds_time(time.time() - flag)
            self.send(f'\r\n\x1b[36m** 执行结束，总耗时：{human_time} **\x1b[0m')
        except socket.timeout:
            code = 130
            self.send('\r\n\x1b[31m### Time out\x1b[0m')
        except Exception as e:
            code = 131
            self.send(f'\r\n\x1b[31m### Exception {e}\x1b[0m')
            logger.error(f'Job 执行失败 key={self.key}: {e}', exc_info=True)
        finally:
            self.send_status(code)
