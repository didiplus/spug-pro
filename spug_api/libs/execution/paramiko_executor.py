# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from libs.ssh import SSH
from libs.execution.base import BaseExecutor
from libs.utils import str_decode
from typing import Generator, Tuple, Optional, Dict
import subprocess
import tempfile
import logging

logger = logging.getLogger(__name__)


class ParamikoExecutor(BaseExecutor):
    """基于 Paramiko 的执行器，封装现有 SSH 逻辑，行为完全一致"""

    def __init__(self, hostname, port=22, username='root', pkey=None, password=None,
                 default_env=None, connect_timeout=10, term=None):
        self._pkey_str = pkey if isinstance(pkey, str) else None
        self._hostname = hostname
        self._port = port or 22
        self._username = username
        self._password = password
        self._ssh = SSH(
            hostname, port, username, pkey, password,
            default_env=default_env,
            connect_timeout=connect_timeout,
            term=term
        )

    def __enter__(self):
        self._ssh.__enter__()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._ssh.__exit__(exc_type, exc_val, exc_tb)

    def exec_command(self, command: str, environment: Optional[Dict] = None) -> Tuple[int, str]:
        return self._ssh.exec_command(command, environment)

    def exec_command_with_stream(self, command: str, environment: Optional[Dict] = None) -> Generator[Tuple[int, str], None, None]:
        yield from self._ssh.exec_command_with_stream(command, environment)

    def transfer_file(self, local_path: str, remote_path: str,
                      archive: bool = True) -> Generator[Tuple[int, str], None, None]:
        with tempfile.NamedTemporaryFile(mode='w') as fp:
            if self._pkey_str:
                fp.write(self._pkey_str)
                fp.write('\n')
                fp.flush()

            options = '-azv --progress' if archive else '-rzv --progress'
            src = f'{local_path}/'
            dst = f'{self._username}@{self._hostname}:{remote_path}'
            ssh_cmd = ['ssh', '-p', str(self._port), '-o', 'StrictHostKeyChecking=no']
            if self._pkey_str:
                ssh_cmd += ['-i', fp.name]
            command = ['rsync'] + options.split() + ['-h', '-e', ' '.join(ssh_cmd), src, dst]

            logger.info(f'rsync transfer: {local_path} -> {self._username}@{self._hostname}:{remote_path}')
            task_proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            message = b''
            while True:
                output = task_proc.stdout.read(1)
                if not output:
                    break
                if output in (b'\r', b'\n'):
                    message += b'\r\n' if output == b'\n' else b'\r'
                    decoded = str_decode(message)
                    if 'rsync: command not found' in decoded:
                        yield -1, '\r\n\x1b[31m检测到该主机未安装rsync，可通过批量执行/执行任务模块进行以下命令批量安装\x1b[0m'
                        yield -1, '\r\nCentos/Redhat: yum install -y rsync'
                        yield -1, '\r\nUbuntu/Debian: apt install -y rsync'
                        break
                    yield -1, decoded
                    message = b''
                else:
                    message += output
            status = task_proc.wait()
            yield status, ''
