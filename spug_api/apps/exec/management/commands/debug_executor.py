# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.core.management.base import BaseCommand
from apps.host.models import Host
from apps.setting.utils import AppSetting
from libs.execution.factory import ExecutorFactory
import logging
import sys

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "调试执行引擎（Paramiko / Ansible）"

    def add_arguments(self, parser):
        parser.add_argument('host_id', type=int, help='主机 ID（Host 表的主键）')
        parser.add_argument('--cmd', default='hostname && whoami && uptime', help='执行的命令')
        parser.add_argument('--engine', choices=['paramiko', 'ansible', 'auto'], default='auto',
                            help='强制指定引擎（auto=读取系统配置）')

    def handle(self, *args, **options):
        host_id = options['host_id']
        command = options['cmd']
        force_engine = options['engine']

        host = Host.objects.filter(pk=host_id).first()
        if not host:
            self.stdout.write(self.style.ERROR(f'主机 ID {host_id} 不存在'))
            return

        self.stdout.write(self.style.MIGRATE_HEADING('=' * 60))
        self.stdout.write(self.style.MIGRATE_HEADING(f'主机: {host.name} ({host.hostname}:{host.port})'))
        self.stdout.write(self.style.MIGRATE_HEADING(f'用户: {host.username}'))
        self.stdout.write(self.style.MIGRATE_HEADING(f'命令: {command}'))

        if force_engine != 'auto':
            AppSetting.set('exec_engine', force_engine)
            self.stdout.write(self.style.WARNING(f'已临时切换引擎为: {force_engine}'))

        engine_name = ExecutorFactory.get_engine_name()
        self.stdout.write(self.style.MIGRATE_HEADING(f'当前引擎: {engine_name}'))
        self.stdout.write(self.style.MIGRATE_HEADING('=' * 60))

        executor = ExecutorFactory.create(
            hostname=host.hostname,
            port=host.port,
            username=host.username,
            pkey=host.private_key,
        )

        self.stdout.write(f'\n执行器类型: {type(executor).__name__}\n')
        self.stdout.write(self.style.MIGRATE_HEADING('--- 流式输出开始 ---\n'))

        exit_code = -1
        try:
            with executor:
                for code, line in executor.exec_command_with_stream(command):
                    if line:
                        self.stdout.write(line, ending='')
                    if code != -1:
                        exit_code = code
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\n异常: {e}'))
            logger.error(f'执行异常', exc_info=True)
            exit_code = 131

        self.stdout.write(self.style.MIGRATE_HEADING('\n--- 流式输出结束 ---'))
        self.stdout.write('')

        if exit_code == 0:
            self.stdout.write(self.style.SUCCESS(f'退出码: {exit_code} (成功)'))
        elif exit_code == 130:
            self.stdout.write(self.style.WARNING(f'退出码: {exit_code} (超时/不可达)'))
        elif exit_code == 131:
            self.stdout.write(self.style.ERROR(f'退出码: {exit_code} (异常)'))
        else:
            self.stdout.write(self.style.ERROR(f'退出码: {exit_code} (失败)'))

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('=' * 60))

        if engine_name == 'ansible':
            self.stdout.write(self.style.WARNING(
                '\n调试提示:\n'
                '  1. ansible-runner 临时目录在执行后自动清理，如需保留请注释 __exit__ 中的 shutil.rmtree\n'
                '  2. 查看 ansible 日志: export ANSIBLE_DEBUG=1\n'
                '  3. 验证 ansible 可达: ansible -i "host," all -m ping\n'
                '  4. 检查 SSH 连接: ssh -o StrictHostKeyChecking=no -i <key> user@host\n'
            ))