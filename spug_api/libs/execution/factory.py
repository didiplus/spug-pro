# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from libs.execution.paramiko_executor import ParamikoExecutor
import logging

logger = logging.getLogger(__name__)

ENGINE_PARAMIKO = 'paramiko'
ENGINE_ANSIBLE = 'ansible'

_VALID_ENGINES = {ENGINE_PARAMIKO, ENGINE_ANSIBLE}


class ExecutorFactory:
    """执行引擎工厂，根据系统配置返回对应的 Executor 实例"""

    @staticmethod
    def get_engine_name() -> str:
        try:
            from apps.setting.utils import AppSetting
            engine = AppSetting.get_default('exec_engine', ENGINE_PARAMIKO)
        except Exception as e:
            logger.warning(f'读取执行引擎配置失败: {e}，使用默认 {ENGINE_PARAMIKO}')
            return ENGINE_PARAMIKO
        if engine not in _VALID_ENGINES:
            logger.warning(f'未知的执行引擎 {engine!r}，回退到 {ENGINE_PARAMIKO}')
            return ENGINE_PARAMIKO
        return engine

    @staticmethod
    def create(hostname, port=22, username='root', pkey=None, password=None,
               default_env=None, connect_timeout=10, term=None):
        engine = ExecutorFactory.get_engine_name()
        logger.info(f'创建执行引擎: {engine}, 目标主机: {hostname}')

        if engine == ENGINE_ANSIBLE:
            from libs.execution.ansible_executor import AnsibleExecutor
            return AnsibleExecutor(
                hostname, port, username, pkey, password,
                default_env=default_env,
                connect_timeout=connect_timeout,
                term=term
            )

        return ParamikoExecutor(
            hostname, port, username, pkey, password,
            default_env=default_env,
            connect_timeout=connect_timeout,
            term=term
        )
