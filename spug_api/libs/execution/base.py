# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from abc import ABC, abstractmethod
from typing import Generator, Tuple, Optional, Dict


class BaseExecutor(ABC):
    """执行引擎抽象基类，定义统一接口供 Job/Deploy/Transfer 等模块调用"""

    @abstractmethod
    def exec_command(self, command: str, environment: Optional[Dict] = None) -> Tuple[int, str]:
        """同步执行命令，返回 (exit_code, output)"""
        pass

    @abstractmethod
    def exec_command_with_stream(self, command: str, environment: Optional[Dict] = None) -> Generator[Tuple[int, str], None, None]:
        """流式执行命令，yield (exit_code, line)；中间行 exit_code 为 -1，最后一行携带真实退出码"""
        pass

    @abstractmethod
    def transfer_file(self, local_path: str, remote_path: str,
                      archive: bool = True) -> Generator[Tuple[int, str], None, None]:
        """传输文件/目录到远程主机，yield (exit_code, line)；中间行 exit_code 为 -1，最后一行携带真实退出码"""
        pass

    @abstractmethod
    def __enter__(self):
        """建立连接"""
        pass

    @abstractmethod
    def __exit__(self, exc_type, exc_val, exc_tb):
        """关闭连接"""
        pass
