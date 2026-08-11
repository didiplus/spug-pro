# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django_redis import get_redis_connection
from libs.utils import human_seconds_time
from libs.execution.factory import ExecutorFactory
import threading
import socket
import json
import re
import time
import logging

logger = logging.getLogger(__name__)



def exec_worker_handler(job):
    job = Job(**json.loads(job))
    threading.Thread(target=job.run).start()


class Job:
    def __init__(self, key, name, hostname, port, username, pkey, command, interpreter, params=None, token=None,
                 term=None, inspect_task_id=None, inspect_batch_id=None, inspect_item_id=None, inspect_item_ids=None):
        self.ssh = ExecutorFactory.create(hostname, port, username, pkey, term=term)
        self.key = key
        self.command = self._handle_command(command, interpreter)
        self.token = token
        self.inspect_task_id = inspect_task_id
        self.inspect_batch_id = inspect_batch_id
        self.inspect_item_id = inspect_item_id
        self.inspect_item_ids = inspect_item_ids or []
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
        try:
            self._send({'key': self.key, 'data': data})
        except Exception:
            pass
        if self.inspect_task_id:
            self._output_parts.append(data)

    def send_status(self, code):
        try:
            self._send({'key': self.key, 'status': code})
        except Exception:
            pass
        if self.inspect_task_id:
            try:
                from django.db import connections, close_old_connections
                close_old_connections()
                from apps.exec.models import InspectResult, InspectTask, InspectItem
                from apps.exec.inspect import judge_inspect, parse_combined_output

                task = InspectTask.objects.filter(pk=self.inspect_task_id).first()
                raw_output = ''
                if self._output_parts:
                    raw_output = re.sub(r'\x1b\[[0-9;]*m', '', ''.join(self._output_parts))
                duration = int(time.time() - self._start_time) if hasattr(self, '_start_time') else 0

                if self.inspect_item_ids:
                    parsed = parse_combined_output(raw_output, self.inspect_item_ids)
                    for item_id in self.inspect_item_ids:
                        result = InspectResult.objects.filter(
                            task_id=self.inspect_task_id, host_id=self.key,
                            batch_id=self.inspect_batch_id, item_id=item_id
                        ).order_by('-id').first()
                        if not result:
                            continue
                        item = InspectItem.objects.filter(pk=item_id).first()
                        part = parsed.get(item_id, {'output': '', 'exit_code': -1})
                        if item:
                            status, matched, actual_value = judge_inspect(part['output'], part['exit_code'], item)
                            result.status = status
                            result.matched = matched or ''
                            result.actual_value = actual_value
                        else:
                            result.status = 'success' if part['exit_code'] == 0 else 'error'
                        result.exit_code = part['exit_code']
                        result.duration = duration
                        result.output = part['output']
                        result.save()
                        logger.warning(f'Inspect updated: task={self.inspect_task_id} host={self.key} item={item_id} status={result.status}')
                else:
                    result_qs = InspectResult.objects.filter(
                        task_id=self.inspect_task_id, host_id=self.key
                    )
                    if self.inspect_batch_id:
                        result_qs = result_qs.filter(batch_id=self.inspect_batch_id)
                    if self.inspect_item_id:
                        result_qs = result_qs.filter(item_id=self.inspect_item_id)
                    result = result_qs.order_by('-id').first()
                    if result:
                        item = InspectItem.objects.filter(pk=self.inspect_item_id).first() if self.inspect_item_id else None
                        if item:
                            status, matched, actual_value = judge_inspect(raw_output, code, item)
                            result.status = status
                            result.matched = matched or ''
                            result.actual_value = actual_value
                        else:
                            result.status = 'success' if code == 0 else 'error'
                        result.exit_code = code
                        result.duration = duration
                        result.output = raw_output
                        result.save()
                        logger.warning(f'Inspect updated: task={self.inspect_task_id} host={self.key} item={self.inspect_item_id} status={result.status}')

                self._try_send_notify(task)
            except Exception as e:
                logger.warning(f'Inspect result update failed: {e}', exc_info=True)
            finally:
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
            batch_qs = InspectResult.objects.filter(task_id=task.id)
            if self.inspect_batch_id:
                batch_qs = batch_qs.filter(batch_id=self.inspect_batch_id)
            pending_count = batch_qs.filter(status__in=['pending', 'running']).count()
            if pending_count > 0:
                return
            results = list(batch_qs)
            total = len(results)
            success = sum(1 for r in results if r.status == 'success')
            warning = sum(1 for r in results if r.status == 'warning')
            error = sum(1 for r in results if r.status == 'error')
            from apps.host.models import Host
            error_hosts = []
            for r in results:
                if r.status in ['error', 'warning']:
                    host = Host.objects.filter(pk=r.host_id).first()
                    error_hosts.append(f"{host.name if host else str(r.host_id)}/{r.item_name}({r.status})")
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
                lines.append(f'异常项: {", ".join(error_hosts[:10])}')
            message = '\n'.join(lines)
            from libs.spug import Notification
            notify = Notification(notify_grp, event, task.name, title, message, None)
            notify.dispatch_monitor(notify_mode)
            logger.warning(f'Inspect notify sent: task={task.id} title={title}')
        except Exception as e:
            logger.warning(f'Inspect notify failed: {e}')


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
