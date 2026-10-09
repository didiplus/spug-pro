# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Released under the AGPL-3.0 License.
"""
SSH 客户端封装模块，基于 paramiko 实现。

核心功能：
  - 多格式私钥加载（RSA / ECDSA / Ed25519 / DSA，兼容 PEM 与 OpenSSH 格式）
  - RSA 签名算法自动协商（rsa-sha2-256 / ssh-rsa，适配 OpenSSL 3.x）
  - 交互式 Shell 通道与原始 exec 通道两种命令执行模式
  - SFTP 文件传输
  - 公钥自动分发（add_public_key）
"""
from paramiko.client import SSHClient, AutoAddPolicy
from paramiko.rsakey import RSAKey
from paramiko.ecdsakey import ECDSAKey
from paramiko.ed25519key import Ed25519Key
from paramiko.dsskey import DSSKey
from paramiko.auth_handler import AuthHandler
from paramiko.ssh_exception import AuthenticationException, SSHException
from io import StringIO
from uuid import uuid4
import time
import re

# 支持的私钥格式，按尝试顺序排列（Ed25519 优先，最现代且无 SHA-1 依赖）
_PKEY_CLASSES = (Ed25519Key, RSAKey, ECDSAKey, DSSKey)


def _load_pkey(pkey):
    """
    加载私钥字符串为 paramiko PKey 对象。

    依次尝试 Ed25519 / RSA / ECDSA / DSA 四种格式解析，
    覆盖 PEM 传统格式（-----BEGIN RSA PRIVATE KEY-----）
    和 OpenSSH 新格式（-----BEGIN OPENSSH PRIVATE KEY-----）。

    :param pkey: 私钥字符串或已加载的 PKey 对象
    :return: paramiko PKey 对象
    :raises SSHException: 所有格式均无法解析时抛出
    """
    if not isinstance(pkey, str):
        return pkey
    key_obj = StringIO(pkey)
    for KeyClass in _PKEY_CLASSES:
        try:
            key_obj.seek(0)
            return KeyClass.from_private_key(key_obj)
        except (SSHException, ValueError):
            continue
    raise SSHException('无法解析私钥，支持的格式：RSA/ECDSA/Ed25519/DSA（PEM 或 OpenSSH 格式）')


# ---------------------------------------------------------------------------
# RSA 签名算法兼容性补丁
#
# 背景：OpenSSH 8.7+ + OpenSSL 3.x 默认禁用 ssh-rsa（SHA-1）签名算法，
#       只接受 rsa-sha2-256 / rsa-sha2-512。旧版 paramiko（< 2.9）不支持
#       新签名算法，导致 RSA 密钥认证被服务器拒绝（E02 错误）。
#
# 策略：仅在 paramiko 未内置 _finalize_pubkey_algorithm 时才打补丁。
#       paramiko 3.4.0 已原生支持 rsa-sha2-256，无需补丁。
# ---------------------------------------------------------------------------
if not hasattr(AuthHandler, '_finalize_pubkey_algorithm'):
    def _finalize_pubkey_algorithm(self, key_type):
        """协商 RSA 公钥签名算法，优先使用 rsa-sha2-256，旧服务器回退 ssh-rsa。"""
        if "rsa" not in key_type:
            return key_type

        # OpenSSH < 7.9 不支持 server-sig-algs 扩展，直接使用 ssh-rsa
        if re.search(r"-OpenSSH_(?:[1-6]|7\.[0-8])", self.transport.remote_version):
            pubkey_algo = "ssh-rsa"
            if key_type.endswith("-cert-v01@openssh.com"):
                pubkey_algo += "-cert-v01@openssh.com"
            self.transport._agreed_pubkey_algorithm = pubkey_algo
            return pubkey_algo

        # 获取本地支持的 RSA 签名算法列表
        my_algos = [x for x in self.transport.preferred_pubkeys if "rsa" in x]
        if not my_algos:
            raise SSHException("An RSA key was specified, but no RSA pubkey algorithms are configured!")

        # 与服务器声明的算法取交集，优先使用交集第一个
        server_algo_str = self.transport.server_extensions.get("server-sig-algs", b"")
        if isinstance(server_algo_str, bytes):
            server_algo_str = server_algo_str.decode()

        if server_algo_str:
            server_algos = server_algo_str.split(",")
            agreement = list(filter(server_algos.__contains__, my_algos))
            if agreement:
                pubkey_algo = agreement[0]
            else:
                raise AuthenticationException(f"Unable to agree on a pubkey algorithm for signing a {key_type!r} key!")
        else:
            # 服务器未声明 server-sig-algs，回退到 ssh-rsa
            pubkey_algo = "ssh-rsa"

        if key_type.endswith("-cert-v01@openssh.com"):
            pubkey_algo += "-cert-v01@openssh.com"
        self.transport._agreed_pubkey_algorithm = pubkey_algo
        return pubkey_algo

    AuthHandler._finalize_pubkey_algorithm = _finalize_pubkey_algorithm


class SSH:
    """
    SSH 连接封装类，支持密钥/密码认证、命令执行、SFTP 文件传输。

    用法：
        with SSH(hostname, port, username, pkey=private_key) as ssh:
            code, output = ssh.exec_command_raw('ls -la')
    """

    # EOF 标记用于交互式 Shell 模式下检测命令执行结束和退出码
    EOF_MARKER = 'Spug EOF 2108111926'

    def __init__(self, hostname, port=22, username='root', pkey=None, password=None,
                 default_env=None, connect_timeout=10, term=None):
        """
        :param hostname: 主机名或 IP
        :param port: SSH 端口，默认 22
        :param username: 登录用户名，默认 root
        :param pkey: 私钥字符串或 PKey 对象（优先于密码认证）
        :param password: 密码（密钥认证失败时回退使用）
        :param default_env: 默认环境变量字典
        :param connect_timeout: 连接超时秒数
        :param term: 终端参数（rows/cols 等），用于交互式 Shell
        """
        self.stdout = None
        self.client = None
        self.channel = None
        self.sftp = None
        self.exec_file = None
        self.term = term or {}
        self.default_env = default_env
        self.regex = re.compile(rf'{self.EOF_MARKER} (-?\d+)[\r\n]?')
        self.arguments = {
            'hostname': hostname,
            'port': port,
            'username': username,
            'password': password,
            'pkey': _load_pkey(pkey),
            'timeout': connect_timeout,
            'allow_agent': False,       # 禁用 SSH agent
            'look_for_keys': False,     # 不读取本地 ~/.ssh
            'banner_timeout': 30,
        }

    @staticmethod
    def generate_key():
        """
        生成 2048 位 RSA 密钥对。

        :return: (private_key_pem, public_key_openssh) 元组
                 private_key 为 PEM 格式字符串
                 public_key 为 OpenSSH 格式（ssh-rsa AAAA...）
        """
        key_obj = StringIO()
        key = RSAKey.generate(2048)
        key.write_private_key(key_obj)
        return key_obj.getvalue(), 'ssh-rsa ' + key.get_base64()

    def get_client(self):
        """获取已连接的 SSHClient，懒初始化且复用。"""
        if self.client is not None:
            return self.client
        self.client = SSHClient()
        self.client.set_missing_host_key_policy(AutoAddPolicy)
        self.client.connect(**self.arguments)
        return self.client

    def ping(self):
        """连接探活，只要 get_client 不抛异常即认为连接正常。"""
        return True

    def add_public_key(self, public_key):
        """
        将公钥追加到远程主机的 ~/.ssh/authorized_keys。

        命令逻辑：
          1. 创建 ~/.ssh 目录并设置权限 700（chmod 确保已存在目录权限也正确）
          2. 检查公钥是否已存在，不存在则追加（grep -qF 去重）
          3. 设置 authorized_keys 权限 600

        :param public_key: OpenSSH 格式公钥字符串（如 'ssh-rsa AAAA...'）
        :raises Exception: 命令执行失败（exit_code != 0）
        """
        quoted_key = repr(public_key)
        command = (
            'mkdir -p ~/.ssh && chmod 700 ~/.ssh && '
            '{ grep -qF %s ~/.ssh/authorized_keys 2>/dev/null || echo %s >> ~/.ssh/authorized_keys; } && '
            'chmod 600 ~/.ssh/authorized_keys'
        ) % (quoted_key, quoted_key)
        exit_code, out = self.exec_command_raw(command)
        if exit_code != 0:
            raise Exception(f'add public key error: {out}')

    def exec_command_raw(self, command, environment=None):
        """
        通过 SSH exec 通道直接执行命令（非交互式）。

        使用 makefile 读取输出，确保完整接收数据后再获取退出码，
        避免 recv(-1) 在部分 paramiko 版本中行为不确定的问题。

        :return: (exit_code, output) 元组
        """
        channel = self.client.get_transport().open_session()
        if environment:
            channel.update_environment(environment)
        channel.set_combine_stderr(True)
        channel.exec_command(command)
        stdout = channel.makefile("rb", -1)
        output = stdout.read()
        code = channel.recv_exit_status()
        return code, self._decode(output)

    def exec_command(self, command, environment=None):
        """
        通过交互式 Shell 通道执行命令。

        命令被写入临时文件后通过 source 执行，以 EOF 标记检测结束和退出码。
        适用于需要 Shell 环境变量展开、管道等特性的复杂命令。

        :return: (exit_code, output) 元组
        """
        channel = self._get_channel()
        command = self._handle_command(command, environment)
        channel.sendall(command)
        out, exit_code = '', -1
        for line in self.stdout:
            match = self.regex.search(line)
            if match:
                exit_code = int(match.group(1))
                line = line[:match.start()]
                out += line
                break
            out += line
        return exit_code, out

    def _win_exec_command_with_stream(self, command, environment=None):
        """Windows 主机命令流式执行，通过 PTY 通道逐行 yield 输出。"""
        channel = self.client.get_transport().open_session()
        if environment:
            channel.update_environment(environment)
        channel.set_combine_stderr(True)
        channel.get_pty(width=102)
        channel.exec_command(command)
        stdout = channel.makefile("rb", -1)
        out = stdout.readline()
        while out:
            yield channel.exit_status, self._decode(out)
            out = stdout.readline()
        yield channel.recv_exit_status(), self._decode(out)

    def exec_command_with_stream(self, command, environment=None):
        """
        通过交互式 Shell 通道流式执行命令，逐行 yield 输出。

        适用于长时间运行的命令，前端可实时展示输出。
        """
        channel = self._get_channel()
        command = self._handle_command(command, environment)
        channel.sendall(command)
        exit_code, line = -1, ''
        while True:
            line = self._decode(channel.recv(8196))
            if not line:
                break
            match = self.regex.search(line)
            if match:
                exit_code = int(match.group(1))
                line = line[:match.start()]
                break
            yield exit_code, line
        yield exit_code, line

    def put_file(self, local_path, remote_path, callback=None):
        """通过 SFTP 上传本地文件到远程路径。"""
        sftp = self._get_sftp()
        sftp.put(local_path, remote_path, callback=callback, confirm=False)

    def put_file_by_fl(self, fl, remote_path, callback=None):
        """通过 SFTP 上传文件对象（File-like object）到远程路径。"""
        sftp = self._get_sftp()
        sftp.putfo(fl, remote_path, callback=callback, confirm=False)

    def list_dir_attr(self, path):
        """列出远程目录内容（含文件属性）。"""
        sftp = self._get_sftp()
        return sftp.listdir_attr(path)

    def sftp_stat(self, path):
        """获取远程文件/目录的 stat 信息。"""
        sftp = self._get_sftp()
        return sftp.stat(path)

    def remove_file(self, path):
        """删除远程文件。"""
        sftp = self._get_sftp()
        sftp.remove(path)

    def _get_channel(self):
        """
        获取交互式 Shell 通道，懒初始化。

        初始化时发送命令禁用历史记录、设置 PS1 为空、关闭回显，
        然后等待 EOF 标记确认 Shell 就绪。
        """
        if self.channel:
            return self.channel

        counter = 0
        self.channel = self.client.invoke_shell(**self.term)
        # 初始化 Shell 环境：禁用历史、清空 PS1、关闭回显
        command = '[ -n "$BASH_VERSION" ] && set +o history\n'
        command += '[ -n "$ZSH_VERSION" ] && set +o zle && set -o no_nomatch\n'
        command += 'export PS1= && stty -echo\n'
        command = self._handle_command(command, self.default_env)
        self.channel.sendall(command)
        out = ''
        while True:
            if self.channel.recv_ready():
                out += self._decode(self.channel.recv(8196))
                if self.regex.search(out):
                    self.stdout = self.channel.makefile('r')
                    break
            elif counter >= 100:
                self.client.close()
                raise Exception('Wait spug response timeout')
            else:
                counter += 1
                time.sleep(0.1)
        return self.channel

    def _get_sftp(self):
        """获取 SFTP 客户端，懒初始化且复用。"""
        if self.sftp:
            return self.sftp
        self.sftp = self.client.open_sftp()
        return self.sftp

    def _make_env_command(self, environment):
        """将环境变量字典转换为 export 命令字符串，值中的单引号会被转义。"""
        if not environment:
            return None
        str_envs = []
        for k, v in environment.items():
            k = k.replace('-', '_')
            if isinstance(v, str):
                v = v.replace("'", "'\"'\"'")
            str_envs.append(f"{k}='{v}'")
        return f'export {" ".join(str_envs)}'

    def _handle_command(self, command, environment):
        """
        包装命令：写入临时文件，通过 source 执行，以 EOF 标记捕获退出码。

        这种方式避免了直接在 Shell 中执行长命令时的转义问题，
        同时支持环境变量注入和退出码捕获。
        """
        new_command = commands = ''
        if not self.exec_file:
            self.exec_file = f'/tmp/spug.{uuid4().hex}'
            commands += f'trap \'rm -f {self.exec_file}\' EXIT\n'

        env_command = self._make_env_command(environment)
        if env_command:
            new_command += f'{env_command}\n'
        new_command += command
        new_command += f'\necho {self.EOF_MARKER} $?\n'
        self.put_file_by_fl(StringIO(new_command), self.exec_file)
        commands += f'. {self.exec_file}\n'
        return commands

    def _decode(self, content):
        """解码字节输出，优先 UTF-8，失败则回退 GBK（兼容 Windows 中文）。"""
        try:
            content = content.decode()
        except UnicodeDecodeError:
            content = content.decode(encoding='GBK', errors='ignore')
        return content

    def __enter__(self):
        """
        上下文管理器入口，建立连接并检测远程系统类型。

        Windows 主机（OpenSSH Server）自动切换 exec_command 为 raw 模式，
        因为 Windows 不支持交互式 Shell 的初始化命令。
        """
        self.get_client()
        transport = self.client.get_transport()
        if 'windows' in transport.remote_version.lower():
            self.exec_command = self.exec_command_raw
            self.exec_command_with_stream = self._win_exec_command_with_stream
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """上下文管理器出口，关闭连接并清理引用。"""
        self.client.close()
        self.client = None
