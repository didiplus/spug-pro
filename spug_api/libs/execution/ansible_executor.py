# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from libs.execution.base import BaseExecutor
from typing import Generator, Tuple, Optional, Dict
import tempfile
import shutil
import os
import queue
import threading
import subprocess
import logging

logger = logging.getLogger(__name__)

try:
    import ansible_runner
    HAS_ANSIBLE_RUNNER = True
except ImportError:
    HAS_ANSIBLE_RUNNER = False

_SENTINEL = object()


def _check_ansible_cli() -> Optional[str]:
    """检查 ansible-playbook CLI 是否可用，返回错误信息或 None"""
    try:
        result = subprocess.run(
            ['ansible-playbook', '--version'],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5
        )
        if result.returncode != 0:
            return 'ansible-playbook 命令执行失败，请检查 ansible 安装'
        return None
    except FileNotFoundError:
        return 'ansible-playbook 未安装。ansible-runner 仅是封装层，需要 ansible 核心包，请执行 pip install ansible 后重试'
    except Exception as e:
        return f'检查 ansible-playbook 失败: {e}'


class AnsibleExecutor(BaseExecutor):
    """基于 ansible-runner 的执行器，使用动态 Inventory 和 shell 模块执行命令"""

    def __init__(self, hostname, port=22, username='root', pkey=None, password=None,
                 default_env=None, connect_timeout=10, term=None):
        self._hostname = hostname
        self._port = port or 22
        self._username = username
        self._pkey = pkey
        self._password = password
        self._default_env = default_env or {}
        self._connect_timeout = connect_timeout
        self._tmpdir = None

    def _build_inventory(self) -> dict:
        host_vars = {
            'ansible_host': self._hostname,
            'ansible_port': self._port,
            'ansible_user': self._username,
            'ansible_timeout': self._connect_timeout,
            'ansible_ssh_common_args': '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null',
        }
        if self._password:
            host_vars['ansible_password'] = self._password
        if self._pkey:
            pkey_path = os.path.join(self._tmpdir, 'id_rsa')
            with open(pkey_path, 'w') as f:
                f.write(self._pkey)
            os.chmod(pkey_path, 0o600)
            host_vars['ansible_ssh_private_key_file'] = pkey_path

        return {
            'all': {
                'hosts': {
                    self._hostname: host_vars
                }
            }
        }

    def _build_playbook(self, command: str, environment: Optional[Dict] = None) -> list:
        env_vars = {}
        if self._default_env:
            env_vars.update(self._default_env)
        if environment:
            env_vars.update(environment)

        env_prefix = ''
        for k, v in env_vars.items():
            k = k.replace('-', '_')
            if isinstance(v, str):
                v = v.replace('"', '\\"')
            env_prefix += f'export {k}="{v}"; '

        full_command = env_prefix + command if env_prefix else command

        return [{
            'hosts': 'all',
            'gather_facts': False,
            'tasks': [
                {'shell': full_command, 'register': 'result'},
            ]
        }]

    def _build_envvars(self) -> dict:
        return {
            'ANSIBLE_HOST_KEY_CHECKING': 'False',
            'ANSIBLE_DEPRECATION_WARNINGS': 'False',
            'ANSIBLE_PYTHON_INTERPRETER': 'auto_silent',
        }

    def __enter__(self):
        self._tmpdir = tempfile.mkdtemp(prefix='spug_ansible_')
        for sub_dir in ('inventory', 'project', 'env'):
            os.makedirs(os.path.join(self._tmpdir, sub_dir), exist_ok=True)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._tmpdir:
            shutil.rmtree(self._tmpdir, ignore_errors=True)
            self._tmpdir = None

    def _process_event(self, event: dict) -> Tuple[int, Optional[str]]:
        """处理单个事件，返回 (exit_code, output_line)；exit_code=-1 表示中间行，output=None 表示跳过"""
        event_type = event.get('event', '')
        event_data = event.get('event_data', {})
        res = event_data.get('res', {})

        if event_type == 'runner_on_start':
            return -1, f"\r\n\x1b[36m### Ansible 开始执行: {event_data.get('host', '')}\x1b[0m\r\n"
        elif event_type == 'runner_on_ok':
            stdout = res.get('stdout', '')
            if stdout:
                return 0, stdout + '\n'
            return 0, None
        elif event_type == 'runner_on_failed':
            exit_code = res.get('rc', 1)
            stdout = res.get('stdout', '')
            stderr = res.get('stderr', '')
            parts = []
            if stdout:
                parts.append(stdout + '\n')
            if stderr:
                parts.append(f'\x1b[31m{stderr}\x1b[0m\n')
            return exit_code, ''.join(parts) if parts else None
        elif event_type == 'runner_on_unreachable':
            return 130, f'\r\n\x1b[31m### 主机不可达: {event_data.get("host", "")}\x1b[0m\r\n'
        elif event_type == 'verbose':
            verbose_msg = event_data.get('verbose', '')
            if verbose_msg:
                return -1, f'\x1b[33m{verbose_msg}\x1b[0m\n'
            return -1, None
        return -1, None

    def exec_command(self, command: str, environment: Optional[Dict] = None) -> Tuple[int, str]:
        if not HAS_ANSIBLE_RUNNER:
            return 131, 'ansible-runner 未安装，请执行 pip install ansible-runner 后重试'

        err = _check_ansible_cli()
        if err:
            return 127, err

        inventory = self._build_inventory()
        playbook = self._build_playbook(command, environment)
        envvars = self._build_envvars()

        logger.info(f'Ansible exec_command: host={self._hostname}, cmd={command[:80]}')

        try:
            result = ansible_runner.run(
                private_data_dir=self._tmpdir,
                inventory=inventory,
                playbook=playbook,
                envvars=envvars,
            )

            logger.info(f'Ansible run completed: rc={result.rc}, status={result.status}')

            output = ''
            exit_code = result.rc if result.rc is not None else 1
            for event in result.events:
                event_type = event.get('event', '')
                event_data = event.get('event_data', {})
                res = event_data.get('res', {})

                if event_type == 'runner_on_ok':
                    output = res.get('stdout', '')
                elif event_type == 'runner_on_failed':
                    output = res.get('stdout', '') + res.get('stderr', '')
                elif event_type == 'runner_on_unreachable':
                    output = f"主机不可达: {event_data.get('host', '')}"
                    exit_code = 130
                elif event_type == 'verbose':
                    verbose_msg = event_data.get('verbose', '')
                    if verbose_msg:
                        output += verbose_msg + '\n'

            return exit_code, output
        except Exception as e:
            logger.error(f'Ansible 执行失败: {e}', exc_info=True)
            return 131, f'Ansible 执行失败: {e}'

    def exec_command_with_stream(self, command: str, environment: Optional[Dict] = None) -> Generator[Tuple[int, str], None, None]:
        if not HAS_ANSIBLE_RUNNER:
            yield 131, '\r\n\x1b[31m### ansible-runner 未安装，请执行 pip install ansible-runner 后重试\x1b[0m\r\n'
            return

        err = _check_ansible_cli()
        if err:
            yield 127, f'\r\n\x1b[31m### {err}\x1b[0m\r\n'
            return

        inventory = self._build_inventory()
        playbook = self._build_playbook(command, environment)
        envvars = self._build_envvars()

        logger.info(f'Ansible stream: host={self._hostname}, cmd={command[:80]}')
        logger.debug(f'Inventory: {inventory}')
        logger.debug(f'Playbook: {playbook}')
        logger.debug(f'Envvars: {envvars}')
        logger.debug(f'Private data dir: {self._tmpdir}')

        event_queue: queue.Queue = queue.Queue()
        event_count = 0
        final_rc = [None]
        final_error = [None]

        def event_handler(event):
            nonlocal event_count
            event_count += 1
            logger.debug(f'Event #{event_count}: {event.get("event", "unknown")}')
            event_queue.put(event)

        def run_in_thread():
            try:
                result = ansible_runner.run(
                    private_data_dir=self._tmpdir,
                    inventory=inventory,
                    playbook=playbook,
                    envvars=envvars,
                    event_handler=event_handler,
                )
                logger.info(f'Ansible run finished: rc={result.rc}, status={result.status}, events={event_count}')
                final_rc[0] = result.rc if result.rc is not None else 1
            except Exception as e:
                logger.error(f'Ansible run thread error: {e}', exc_info=True)
                final_error[0] = e
            finally:
                event_queue.put(_SENTINEL)

        thread = threading.Thread(target=run_in_thread, daemon=True)
        thread.start()
        logger.info('Ansible 执行线程已启动')

        exit_code = -1
        while True:
            try:
                item = event_queue.get(timeout=0.5)
            except queue.Empty:
                if not thread.is_alive():
                    logger.debug('Thread finished, draining remaining events')
                    while not event_queue.empty():
                        item = event_queue.get_nowait()
                        if item is _SENTINEL:
                            continue
                        code, line = self._process_event(item)
                        if code != -1:
                            exit_code = code
                        if line:
                            yield -1, line
                    break
                continue

            if item is _SENTINEL:
                logger.info(f'Sentinel received, final_rc={final_rc[0]}, final_error={final_error[0]}')
                if final_error[0] is not None:
                    exit_code = 131
                    yield -1, f'\r\n\x1b[31m### Ansible 执行失败: {final_error[0]}\x1b[0m\r\n'
                continue

            try:
                code, line = self._process_event(item)
                if code != -1:
                    exit_code = code
                if line:
                    yield -1, line
            except Exception as e:
                logger.error(f'Event process error: {e}', exc_info=True)
                yield -1, f'\r\n\x1b[31m### 事件处理异常: {e}\x1b[0m\r\n'

        try:
            thread.join(timeout=5)
        except Exception:
            pass

        if exit_code == -1 and final_rc[0] is not None:
            exit_code = final_rc[0]
            logger.info(f'Using final_rc as exit_code: {exit_code}')

        if exit_code == -1:
            exit_code = 131
            yield -1, '\r\n\x1b[31m### Ansible 执行异常终止，未收到结果事件\x1b[0m\r\n'

        logger.info(f'Ansible stream done: exit_code={exit_code}')
        yield exit_code, ''

    def _build_sync_playbook(self, local_path: str, remote_path: str,
                             archive: bool = True) -> list:
        return [{
            'hosts': 'all',
            'gather_facts': False,
            'tasks': [{
                'copy': {
                    'src': local_path + '/',
                    'dest': remote_path,
                    'directory_mode': '0755',
                },
                'register': 'sync_result',
            }],
        }]

    def _process_sync_event(self, event: dict) -> Tuple[int, Optional[str]]:
        """处理 copy 模块事件"""
        event_type = event.get('event', '')
        event_data = event.get('event_data', {})
        res = event_data.get('res', {})

        if event_type == 'runner_on_start':
            return -1, f"\r\n\x1b[36m### Ansible 分发开始: {event_data.get('host', '')}\x1b[0m\r\n"
        elif event_type == 'runner_on_ok':
            changed = res.get('changed', False)
            dest = res.get('dest', '')
            if changed:
                return 0, f'\x1b[32m文件已分发到 {dest}\x1b[0m\n'
            else:
                return 0, '\x1b[32m文件已同步（无变化）\x1b[0m\n'
        elif event_type == 'runner_on_failed':
            exit_code = res.get('rc', 1)
            msg = res.get('msg', '')
            stdout = res.get('stdout', '')
            stderr = res.get('stderr', '')
            parts = []
            if msg:
                parts.append(f'\x1b[31m{msg}\x1b[0m\n')
            if stdout:
                parts.append(stdout + '\n')
            if stderr:
                parts.append(f'\x1b[31m{stderr}\x1b[0m\n')
            return exit_code, ''.join(parts) if parts else None
        elif event_type == 'runner_on_unreachable':
            return 130, f'\r\n\x1b[31m### 主机不可达: {event_data.get("host", "")}\x1b[0m\r\n'
        elif event_type == 'verbose':
            verbose_msg = event_data.get('verbose', '')
            if verbose_msg:
                return -1, f'\x1b[33m{verbose_msg}\x1b[0m\n'
            return -1, None
        return -1, None

    def transfer_file(self, local_path: str, remote_path: str,
                      archive: bool = True) -> Generator[Tuple[int, str], None, None]:
        if not HAS_ANSIBLE_RUNNER:
            yield 131, '\r\n\x1b[31m### ansible-runner 未安装，请执行 pip install ansible-runner 后重试\x1b[0m\r\n'
            return

        err = _check_ansible_cli()
        if err:
            yield 127, f'\r\n\x1b[31m### {err}\x1b[0m\r\n'
            return

        _auto_cleanup = False
        if self._tmpdir is None:
            self.__enter__()
            _auto_cleanup = True

        inventory = self._build_inventory()
        playbook = self._build_sync_playbook(local_path, remote_path, archive)
        envvars = self._build_envvars()

        logger.info(f'Ansible transfer: {local_path} -> {self._username}@{self._hostname}:{remote_path}')
        logger.debug(f'Inventory: {inventory}')
        logger.debug(f'Sync playbook: {playbook}')

        event_queue: queue.Queue = queue.Queue()
        event_count = 0
        final_rc = [None]
        final_error = [None]

        def event_handler(event):
            nonlocal event_count
            event_count += 1
            logger.debug(f'Sync Event #{event_count}: {event.get("event", "unknown")}')
            event_queue.put(event)

        def run_in_thread():
            try:
                result = ansible_runner.run(
                    private_data_dir=self._tmpdir,
                    inventory=inventory,
                    playbook=playbook,
                    envvars=envvars,
                    event_handler=event_handler,
                )
                logger.info(f'Ansible sync finished: rc={result.rc}, status={result.status}, events={event_count}')
                final_rc[0] = result.rc if result.rc is not None else 1
            except Exception as e:
                logger.error(f'Ansible sync thread error: {e}', exc_info=True)
                final_error[0] = e
            finally:
                event_queue.put(_SENTINEL)

        thread = threading.Thread(target=run_in_thread, daemon=True)
        thread.start()

        exit_code = -1
        while True:
            try:
                item = event_queue.get(timeout=0.5)
            except queue.Empty:
                if not thread.is_alive():
                    while not event_queue.empty():
                        item = event_queue.get_nowait()
                        if item is _SENTINEL:
                            continue
                        code, line = self._process_sync_event(item)
                        if code != -1:
                            exit_code = code
                        if line:
                            yield -1, line
                    break
                continue

            if item is _SENTINEL:
                if final_error[0] is not None:
                    exit_code = 131
                    yield -1, f'\r\n\x1b[31m### Ansible 分发失败: {final_error[0]}\x1b[0m\r\n'
                continue

            try:
                code, line = self._process_sync_event(item)
                if code != -1:
                    exit_code = code
                if line:
                    yield -1, line
            except Exception as e:
                logger.error(f'Sync event process error: {e}', exc_info=True)
                yield -1, f'\r\n\x1b[31m### 事件处理异常: {e}\x1b[0m\r\n'

        try:
            thread.join(timeout=5)
        except Exception:
            pass

        if exit_code == -1 and final_rc[0] is not None:
            exit_code = final_rc[0]

        if exit_code == -1:
            exit_code = 131
            yield -1, '\r\n\x1b[31m### Ansible 分发异常终止，未收到结果事件\x1b[0m\r\n'

        if _auto_cleanup:
            self.__exit__(None, None, None)

        yield exit_code, ''
