# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django_redis import get_redis_connection
from libs.utils import human_seconds_time
from libs.execution.factory import ExecutorFactory, ENGINE_ANSIBLE
from concurrent.futures import ThreadPoolExecutor, as_completed

import socket
import json
import re
import time
import logging

logger = logging.getLogger(__name__)

_PYTHON_VERSION_ERROR_MARKERS = (
    'requires Python 3.9 or newer',
    'Python 3.9 or newer',
    'minimum Python version is 3.9',
    'python version 3.8 is too old',
    'python 3.8 is not supported',
    'requires Python >= 3.9',
    'Python >= 3.9',
    'python>=3.9',
    'python >= 3.9',
    'need python 3.9',
    'python 3.9+',
    'python version is too old',
    'python is too old',
    'unsupported python version',
    'python 2.7 is not supported',
    'python 3.6 is not supported',
    'python 3.7 is not supported',
    'requires python 3.8',
    'requires python 3.9',
    'minimum python version',
    'ansible requires python',
    "python version doesn't meet",
    'failed to import the required python library',
    'python interpreter was not found',
    'no python interpreter',
)

_PARAMIKO_FALLBACK_HINT = (
    '\r\n\x1b[33m### 检测到目标机 Python 版本不满足 ansible-core 要求，'
    '自动降级到 Paramiko 引擎重试...\x1b[0m\r\n'
)
_EXECUTING_HINT = '\r\n\x1b[36m### Executing ...\x1b[0m\r\n'
_BATCH_PARALLEL_MAX = 20


def _is_python_version_error(output):
    if not output:
        return False
    output_lower = output.lower()
    return any(m.lower() in output_lower for m in _PYTHON_VERSION_ERROR_MARKERS)


def build_command(command, interpreter):
    """根据解释器类型包装命令，python 解释器自动探测 python3"""
    if interpreter == 'python':
        attach = 'INTERPRETER=python\ncommand -v python3 &> /dev/null && INTERPRETER=python3'
        return f'{attach}\n$INTERPRETER << EOF\n# -*- coding: UTF-8 -*-\n{command}\nEOF'
    return command


def build_host_env(host, interpreter, params=None):
    """构建单主机环境变量，包含 SPUG_* 标识与用户自定义参数"""
    env = dict(
        SPUG_HOST_ID=str(host['id']),
        SPUG_HOST_NAME=host.get('name', ''),
        SPUG_HOST_HOSTNAME=host['hostname'],
        SPUG_SSH_PORT=str(host.get('port', 22)),
        SPUG_SSH_USERNAME=host.get('username', 'root'),
        SPUG_INTERPRETER=interpreter,
    )
    if isinstance(params, dict):
        env.update({f'_SPUG_{k}': str(v) for k, v in params.items()})
    return env


def exec_worker_handler(job):
    data = json.loads(job)
    if data.get('hosts'):
        BatchJob(**data).run()
    else:
        Job(**data).run()


class BatchJob:
    """批量执行 Job，根据系统配置选择执行引擎

    - ansible: 一次 ansible_runner.run() 管理多台主机，因 Python 版本失败的主机降级 Paramiko
    - paramiko: 线程池并行多台 ParamikoExecutor 单独执行
    """

    def __init__(self, token, command, interpreter, hosts, params=None, term=None, **kwargs):
        self.token = token
        self.command = build_command(command, interpreter)
        self.interpreter = interpreter
        self.hosts = hosts
        self.params = params or {}
        self.term = term
        self.rds = get_redis_connection()
        self._host_map = {h['hostname']: h['id'] for h in hosts}
        self._status = {}
        self._output_parts = {h['id']: [] for h in hosts}
        self._start_time = 0

    def _publish(self, message):
        self.rds.publish(self.token, json.dumps(message))

    def send(self, host_id, data):
        try:
            self._publish({'key': host_id, 'data': data})
        except Exception:
            pass
        self._output_parts[host_id].append(data)

    def send_status(self, host_id, code):
        try:
            self._publish({'key': host_id, 'status': code})
        except Exception:
            pass

    def run(self):
        self._start_time = time.time()
        for h in self.hosts:
            self.send(h['id'], _EXECUTING_HINT)

        engine = ExecutorFactory.get_engine_name()
        logger.info(f'BatchJob 启动: {len(self.hosts)} 台主机, 引擎={engine}')
        if engine == ENGINE_ANSIBLE:
            self._run_ansible_batch()
        else:
            self._run_paramiko_parallel()

        self._finalize()

    def _run_ansible_batch(self):
        """Ansible 批量执行：一次 ansible_runner.run() 管理多台主机"""
        from libs.execution.ansible_executor import AnsibleExecutor

        ansible_hosts = [{
            'id': h['id'],
            'name': h['hostname'],
            'hostname': h['hostname'],
            'port': h.get('port', 22),
            'username': h.get('username', 'root'),
            'pkey': h.get('pkey'),
        } for h in self.hosts]
        env = {'SPUG_INTERPRETER': self.interpreter}
        if isinstance(self.params, dict):
            env.update({f'_SPUG_{k}': str(v) for k, v in self.params.items()})

        ansible_last_error = ''
        try:
            executor = AnsibleExecutor(
                hostname='', port=22, username='root', pkey=None,
                default_env={}, connect_timeout=10, term=self.term
            )
            with executor:
                for host_name, code, line in executor.exec_command_with_stream_batch(
                    ansible_hosts, self.command, env
                ):
                    host_id = self._host_map.get(host_name)
                    if host_id is None:
                        continue
                    if line:
                        self.send(host_id, line)
                    if code not in (-1, ''):
                        self._status[host_id] = code
            ansible_last_error = executor.last_error
        except Exception as e:
            logger.error(f'BatchJob ansible 执行失败: {e}', exc_info=True)
            for h in self.hosts:
                if h['id'] not in self._status:
                    self.send(h['id'], f'\r\n\x1b[31m### Exception {e}\x1b[0m')
                    self._status[h['id']] = 131

        self._retry_failed_hosts(ansible_last_error)

    def _run_paramiko_parallel(self):
        """Paramiko 引擎：线程池并行执行多台主机"""
        from libs.execution.paramiko_executor import ParamikoExecutor

        def _exec_one(host):
            host_id = host['id']
            env = build_host_env(host, self.interpreter, self.params)
            code = -1
            try:
                executor = ParamikoExecutor(
                    host['hostname'], host.get('port', 22),
                    host.get('username', 'root'), host.get('pkey'),
                    term=self.term
                )
                with executor:
                    for code, out in executor.exec_command_with_stream(self.command, env):
                        if out:
                            self.send(host_id, out)
            except socket.timeout:
                code = 130
                self.send(host_id, '\r\n\x1b[31m### Time out\x1b[0m')
            except Exception as e:
                code = 131
                self.send(host_id, f'\r\n\x1b[31m### Exception {e}\x1b[0m')
                logger.error(f'BatchJob paramiko 主机 {host["hostname"]} 执行失败: {e}', exc_info=True)
            self._status[host_id] = code

        max_workers = min(len(self.hosts), _BATCH_PARALLEL_MAX)
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = [pool.submit(_exec_one, h) for h in self.hosts]
            for f in as_completed(futures):
                try:
                    f.result()
                except Exception as e:
                    logger.error(f'BatchJob paramiko 线程异常: {e}', exc_info=True)

    def _retry_failed_hosts(self, ansible_last_error):
        """检测因 Python 版本失败的主机，降级 Paramiko 重试"""
        global_output = ''.join(''.join(parts) for parts in self._output_parts.values())
        has_global_py_error = _is_python_version_error(global_output) or _is_python_version_error(ansible_last_error)

        retry_hosts = []
        for h in self.hosts:
            host_id = h['id']
            if self._status.get(host_id, 0) == 0:
                continue
            host_output = ''.join(self._output_parts.get(host_id, []))
            if _is_python_version_error(host_output) or has_global_py_error:
                retry_hosts.append(h)

        if not retry_hosts:
            return

        logger.warning(f'批量执行降级: {len(retry_hosts)}/{len(self.hosts)} 台主机 Python 版本不满足，降级 Paramiko')
        for h in retry_hosts:
            self._retry_one_with_paramiko(h)

    def _retry_one_with_paramiko(self, host):
        """对单台主机用 Paramiko 引擎重试"""
        from libs.execution.paramiko_executor import ParamikoExecutor

        host_id = host['id']
        self.send(host_id, _PARAMIKO_FALLBACK_HINT)
        logger.warning(f'批量执行降级 Paramiko: host={host["hostname"]}')

        env = build_host_env(host, self.interpreter, self.params)
        code = -1
        try:
            with ParamikoExecutor(
                host['hostname'], host.get('port', 22),
                host.get('username', 'root'), host.get('pkey'),
                term=self.term
            ) as fallback:
                for code, out in fallback.exec_command_with_stream(self.command, env):
                    self.send(host_id, out)
        except Exception as e:
            code = 131
            self.send(host_id, f'\r\n\x1b[31m### Exception {e}\x1b[0m')
        self._status[host_id] = code

    def _finalize(self):
        """汇总执行结果，发送状态与耗时"""
        human_time = human_seconds_time(time.time() - self._start_time)
        for h in self.hosts:
            code = self._status.get(h['id'], 131)
            if code == 0:
                self.send(h['id'], f'\r\n\x1b[36m** 执行结束，总耗时：{human_time} **\x1b[0m')
            self.send_status(h['id'], code)


class Job:
    def __init__(self, key, name, hostname, port, username, pkey, command, interpreter, params=None, token=None,
                 term=None, inspect_task_id=None, inspect_batch_id=None, inspect_item_id=None, inspect_item_ids=None):
        self.ssh = ExecutorFactory.create(hostname, port, username, pkey, term=term)
        self._conn_params = (hostname, port, username, pkey, term)
        self.key = key
        self.command = build_command(command, interpreter)
        self.token = token
        self.inspect_task_id = inspect_task_id
        self.inspect_batch_id = inspect_batch_id
        self.inspect_item_id = inspect_item_id
        self.inspect_item_ids = inspect_item_ids or []
        self._output_parts = []
        self.rds = get_redis_connection()
        self.env = build_host_env(
            {'id': key, 'name': name, 'hostname': hostname, 'port': port, 'username': username},
            interpreter, params
        )

    def _send(self, message):
        self.rds.publish(self.token, json.dumps(message))

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


    def _retry_with_paramiko(self):
        """用 Paramiko 引擎重试，返回 exit_code"""
        from libs.execution.paramiko_executor import ParamikoExecutor
        self.send(_PARAMIKO_FALLBACK_HINT)
        logger.warning(f'目标机 Python 版本不满足 ansible 要求，自动降级到 Paramiko 引擎 key={self.key}')
        hostname, port, username, pkey, term = self._conn_params
        fallback = ParamikoExecutor(hostname, port, username, pkey, term=term)
        code = -1
        with fallback:
            for code, out in fallback.exec_command_with_stream(self.command, self.env):
                self.send(out)
        return code

    def run(self):
        if not self.token:
            with self.ssh:
                code, output = self.ssh.exec_command(self.command, self.env)
            if code != 0 and (_is_python_version_error(output) or _is_python_version_error(getattr(self.ssh, 'last_error', ''))):
                from libs.execution.paramiko_executor import ParamikoExecutor
                logger.warning(f'目标机 Python 版本不满足 ansible 要求，自动降级到 Paramiko 引擎 key={self.key}')
                hostname, port, username, pkey, term = self._conn_params
                fallback = ParamikoExecutor(hostname, port, username, pkey, term=term)
                with fallback:
                    return fallback.exec_command(self.command, self.env)
            return code, output
        flag = time.time()
        self._start_time = flag
        self.send(_EXECUTING_HINT)
        code = -1
        output_parts = []
        try:
            with self.ssh:
                for code, out in self.ssh.exec_command_with_stream(self.command, self.env):
                    self.send(out)
                    output_parts.append(out)
            if code != 0 and (_is_python_version_error(''.join(output_parts)) or _is_python_version_error(getattr(self.ssh, 'last_error', ''))):
                code = self._retry_with_paramiko()
            else:
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
