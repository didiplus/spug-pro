# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.core.management.base import BaseCommand
from django.core.management import execute_from_command_line
from django.conf import settings
from django.db import connection, models


class Command(BaseCommand):
    help = '初始化/更新数据库'

    def add_arguments(self, parser):
        parser.add_argument('--menu-only', action='store_true', help='仅更新菜单数据，不执行建表迁移')

    def handle(self, *args, **options):
        if options.get('menu_only'):
            from apps.setting.models import Menu
            Menu.objects.all().delete()
            self._seed_menus()
            self.stdout.write(self.style.SUCCESS('菜单更新成功'))
            return
        args = ['manage.py', 'makemigrations']
        apps = [x.split('.')[-1] for x in settings.INSTALLED_APPS if x.startswith('apps.')]
        execute_from_command_line(args + apps)
        self._drop_all_tables()
        execute_from_command_line(['manage.py', 'migrate'])
        self._seed_menus()
        self.stdout.write(self.style.SUCCESS('初始化/更新成功'))

    def _drop_all_tables(self):
        from django.apps import apps as django_apps
        dropped = 0
        with connection.cursor() as cursor:
            if connection.vendor == 'mysql':
                cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
            tables = connection.introspection.table_names()
            for table in tables:
                try:
                    if connection.vendor == 'mysql':
                        cursor.execute(f"DROP TABLE IF EXISTS `{table}`")
                    else:
                        cursor.execute(f'DROP TABLE IF EXISTS "{table}"')
                    dropped += 1
                except Exception:
                    pass
            if connection.vendor == 'mysql':
                cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
        if dropped:
            self.stdout.write(f'  Dropped {dropped} existing tables')

    def _fix_null_values(self):
        if connection.vendor == 'sqlite':
            return
        from django.apps import apps as django_apps
        fixed = 0
        with connection.cursor() as cursor:
            for model in django_apps.get_models():
                table = model._meta.db_table
                for field in model._meta.local_fields:
                    if getattr(field, 'null', False):
                        continue
                    if isinstance(field, (models.AutoField,)):
                        continue
                    column = field.column
                    default = self._get_default(field)
                    if default is None:
                        continue
                    try:
                        if connection.vendor == 'mysql':
                            cursor.execute(
                                f"UPDATE `{table}` SET `{column}` = %s WHERE `{column}` IS NULL",
                                [default]
                            )
                        else:
                            cursor.execute(
                                f'UPDATE "{table}" SET "{column}" = %s WHERE "{column}" IS NULL',
                                [default]
                            )
                        fixed += cursor.rowcount
                    except Exception:
                        pass
        if fixed:
            self.stdout.write(f'  Fixed {fixed} NULL values')

    @staticmethod
    def _get_default(field):
        if isinstance(field, models.CharField):
            return ''
        if isinstance(field, (models.IntegerField, models.BigIntegerField)):
            return 0
        if isinstance(field, models.BooleanField):
            return 0
        if isinstance(field, models.TextField):
            return ''
        if isinstance(field, models.ForeignKey):
            return None
        return None
    def _seed_menus(self):
        from apps.setting.models import Menu
        if Menu.objects.exists():
            return
        top_menus = [
            (1, 0, '工作台', 'C', 1, '/home', 'pages/home', None, 'DesktopOutlined'),
            (2, 0, 'Dashboard', 'C', 2, '/dashboard', 'pages/dashboard', 'dashboard.dashboard.view', 'DashboardOutlined'),
            (3, 0, '主机管理', 'C', 3, '/host', 'pages/host', 'host.host.view', 'CloudServerOutlined'),
            (4, 0, '数据库管理', 'C', 4, '/db', 'pages/database', 'database.instance.view', 'CloudServerOutlined'),
            (5, 0, '批量执行', 'M', 5, None, None, 'exec.task.do|exec.template.view|exec.inspect.view', 'CodeOutlined'),
            (6, 0, '应用发布', 'M', 6, None, None, 'deploy.app.view|deploy.repository.view|deploy.request.view', 'FlagOutlined'),
            (7, 0, '任务计划', 'C', 7, '/schedule', 'pages/schedule', 'schedule.schedule.view', 'ScheduleOutlined'),
            (8, 0, '配置中心', 'M', 8, None, None, 'config.env.view|config.src.view|config.app.view', 'DeploymentUnitOutlined'),
            (9, 0, '监控中心', 'M', 9, None, None, 'monitor.monitor.view', 'MonitorOutlined'),
            (11, 0, 'Ansible', 'M', 10, None, None, 'ansible.inventory.view|ansible.vault.view|ansible.facts.view|ansible.modules.view|ansible.playbook.view|ansible.playbook.run|ansible.role.view', 'ClusterOutlined'),
            (12, 0, '报警中心', 'M', 12, None, None, 'alarm.alarm.view|alarm.policy.view|alarm.contact.view|alarm.group.view', 'AlertOutlined'),
            (13, 0, '系统管理', 'M', 13, None, None, 'system.account.view|system.role.view|system.setting.view|system.menu.view|system.login.view|system.log.view', 'SettingOutlined'),
            (14, 0, '流水线', 'M', 14, None, None, 'pipeline.pipeline.view|pipeline.pipeline.do', 'ApartmentOutlined'),
        ]
        for mid, pid, name, mtype, order, path, comp, perms, icon in top_menus:
            Menu.objects.create(id=mid, parent_id=pid, menu_name=name, menu_type=mtype, order_num=order, path=path, component=comp, perms=perms, icon=icon)

        children = [
            (5, '执行任务', 'C', 1, '/exec/task', 'pages/exec/task', 'exec.task.do', '0'),
            (5, '模板管理', 'C', 2, '/exec/template', 'pages/exec/template', 'exec.template.view', '0'),
            (5, '文件分发', 'C', 3, '/exec/transfer', 'pages/exec/transfer', 'exec.transfer.do', '0'),
            (5, '巡检任务', 'C', 4, '/exec/inspect', 'pages/exec/inspect', 'exec.inspect.view', '0'),
            (6, '发布配置', 'C', 1, '/deploy/app', 'pages/deploy/app', 'deploy.app.view', '0'),
            (6, '构建仓库', 'C', 2, '/deploy/repository', 'pages/deploy/repository', 'deploy.repository.view', '0'),
            (6, '发布申请', 'C', 3, '/deploy/request', 'pages/deploy/request', 'deploy.request.view', '0'),
            (8, '环境管理', 'C', 1, '/config/environment', 'pages/config/environment', 'config.env.view', '0'),
            (8, '服务配置', 'C', 2, '/config/service', 'pages/config/service', 'config.src.view', '0'),
            (8, '应用配置', 'C', 3, '/config/app', 'pages/config/app', 'config.app.view', '0'),
            (8, '配置详情', 'C', 4, '/config/setting/:type/:id', 'pages/config/setting', None, '1'),
            (9, '检测项', 'C', 1, '/monitor', 'pages/monitor', 'monitor.monitor.view', '0'),
            (9, '监控大盘', 'C', 2, '/monitor/dashboard', 'pages/monitor/dashboard', 'monitor.monitor.view', '0'),
            (11, 'Playbook 管理', 'C', 6, '/ansible/playbook', 'pages/ansible/playbook', 'ansible.playbook.view', '0'),
            (11, 'Inventory', 'C', 1, '/ansible/inventory', 'pages/ansible/inventory', 'ansible.inventory.view', '0'),
            (11, 'Vault', 'C', 2, '/ansible/vault', 'pages/ansible/vault', 'ansible.vault.view', '0'),
            (11, 'Facts', 'C', 3, '/ansible/facts', 'pages/ansible/facts', 'ansible.facts.view', '0'),
            (11, 'Module 浏览器', 'C', 4, '/ansible/modules', 'pages/ansible/modules', 'ansible.modules.view', '0'),
            (11, 'Role 市场', 'C', 5, '/ansible/role-market', 'pages/ansible/role-market', 'ansible.role.view', '0'),
            (12, '报警历史', 'C', 1, '/alarm/alarm', 'pages/alarm/alarm', 'alarm.alarm.view', '0'),
            (12, '告警策略', 'C', 2, '/alarm/policy', 'pages/alarm/policy', 'alarm.policy.view', '0'),
            (12, '报警联系人', 'C', 3, '/alarm/contact', 'pages/alarm/contact', 'alarm.contact.view', '0'),
            (12, '报警联系组', 'C', 4, '/alarm/group', 'pages/alarm/group', 'alarm.group.view', '0'),
            (13, '登录日志', 'C', 1, '/system/login', 'pages/system/login', 'system.login.view', '0'),
            (13, '操作日志', 'C', 2, '/system/log', 'pages/system/operotionlog', 'system.log.view', '0'),
            (13, '账户管理', 'C', 3, '/system/account', 'pages/system/account', 'system.account.view', '0'),
            (13, '角色管理', 'C', 4, '/system/role', 'pages/system/role', 'system.role.view', '0'),
            (13, '系统设置', 'C', 5, '/system/setting', 'pages/system/setting', 'system.setting.view', '0'),
            (13, '菜单管理', 'C', 6, '/system/menu', 'pages/system/menu', 'system.menu.view', '0'),
            (13, 'SSH 会话审计', 'C', 7, '/system/ssh_audit', 'pages/system/ssh_audit', 'host.console.view', '0'),
            (14, '流水线列表', 'C', 1, '/pipeline', 'pages/pipeline', 'pipeline.pipeline.view', '0'),
            (14, '编排编辑器', 'C', 2, '/pipeline/:id', 'pages/pipeline/editor', None, '1'),
            (3, 'Web终端', 'C', 5, '/host/console', 'pages/host/console', 'host.console.view', '1'),
        ]
        for pid, name, mtype, order, path, comp, perms, visible in children:
            Menu.objects.create(parent_id=pid, menu_name=name, menu_type=mtype, order_num=order, path=path, component=comp, perms=perms, visible=visible)

        Menu.objects.create(parent_id=0, menu_name='/welcome/index', menu_type='C', order_num=99, path='/welcome/index', component='pages/welcome/index', visible='1')
        Menu.objects.create(parent_id=0, menu_name='/welcome/info', menu_type='C', order_num=99, path='/welcome/info', component='pages/welcome/info', visible='1')

        buttons = [
            (2, '查看Dashboard', 1, 'dashboard.dashboard.view'),
            (3, '主机查询', 1, 'host.host.view'), (3, '主机新增', 2, 'host.host.add'), (3, '主机修改', 3, 'host.host.edit'), (3, '主机删除', 4, 'host.host.del'),
            (3, 'Web终端', 5, 'host.console.view'),
            (4, '实例查看', 1, 'database.instance.view'), (4, '实例新增', 2, 'database.instance.add'), (4, '实例修改', 3, 'database.instance.edit'), (4, '实例删除', 4, 'database.instance.del'),
            (4, '执行SQL', 5, 'database.instance.execute'), (4, '新建备份', 6, 'database.instance.backup_add'), (4, '下载备份', 7, 'database.instance.backup_download'), (4, '删除备份', 8, 'database.instance.backup_del'),
            (5, '执行任务', 1, 'exec.task.do'), (5, '模板管理', 2, 'exec.template.view'), (5, '文件分发', 3, 'exec.transfer.do'), (5, '巡检任务', 4, 'exec.inspect.view'),
            (6, '发布配置', 1, 'deploy.app.view'), (6, '构建仓库', 2, 'deploy.repository.view'), (6, '发布申请', 3, 'deploy.request.view'),
            (7, '查看任务', 1, 'schedule.schedule.view'), (7, '新建任务', 2, 'schedule.schedule.add'), (7, '编辑任务', 3, 'schedule.schedule.edit'), (7, '删除任务', 4, 'schedule.schedule.del'),
            (8, '环境管理', 1, 'config.env.view'), (8, '服务配置', 2, 'config.src.view'), (8, '应用配置', 3, 'config.app.view'),
            (9, '查看监控', 1, 'monitor.monitor.view'), (9, '新建监控', 2, 'monitor.monitor.add'), (9, '编辑监控', 3, 'monitor.monitor.edit'), (9, '删除监控', 4, 'monitor.monitor.del'),
            (11, '查看Inventory', 1, 'ansible.inventory.view'), (11, '编辑Inventory', 2, 'ansible.inventory.edit'),
            (11, '查看Vault', 3, 'ansible.vault.view'), (11, '编辑Vault', 4, 'ansible.vault.edit'), (11, '解密Vault', 5, 'ansible.vault.decrypt'),
            (11, '查看Facts', 5, 'ansible.facts.view'), (11, '采集Facts', 6, 'ansible.facts.collect'),
            (11, '查看模块', 7, 'ansible.modules.view'),
            (11, '查看Role市场', 8, 'ansible.role.view'), (11, '编辑Role源', 9, 'ansible.role.edit'), (11, '部署Role', 10, 'ansible.role.run'),
            (11, '查看Playbook', 11, 'ansible.playbook.view'), (11, '新建Playbook', 12, 'ansible.playbook.add'), (11, '编辑Playbook', 13, 'ansible.playbook.edit'), (11, '删除Playbook', 14, 'ansible.playbook.del'), (11, '执行Playbook', 15, 'ansible.playbook.run'),
            (12, '查看记录', 1, 'alarm.alarm.view'), (12, '查看策略', 2, 'alarm.policy.view'),
            (12, '查看联系人', 3, 'alarm.contact.view'), (12, '新建联系人', 4, 'alarm.contact.add'), (12, '编辑联系人', 5, 'alarm.contact.edit'), (12, '删除联系人', 6, 'alarm.contact.del'),
            (12, '查看联系组', 7, 'alarm.group.view'), (12, '新建联系组', 8, 'alarm.group.add'), (12, '编辑联系组', 9, 'alarm.group.edit'), (12, '删除联系组', 10, 'alarm.group.del'),
            (13, '查看日志', 1, 'system.login.view'), (13, '查看日志', 2, 'system.log.view'),
            (13, '账户查看', 3, 'system.account.view'), (13, '账户新增', 4, 'system.account.add'), (13, '账户修改', 5, 'system.account.edit'), (13, '账户删除', 6, 'system.account.del'),
            (13, '角色查看', 7, 'system.role.view'), (13, '角色新增', 8, 'system.role.add'), (13, '角色修改', 9, 'system.role.edit'), (13, '角色删除', 10, 'system.role.del'),
            (13, '查看设置', 11, 'system.setting.view'), (13, '编辑设置', 12, 'system.setting.edit'),
            (13, '菜单查看', 13, 'system.menu.view'), (13, '菜单新增', 14, 'system.menu.add'), (13, '菜单修改', 15, 'system.menu.edit'), (13, '菜单删除', 16, 'system.menu.del'),
            (14, '查看流水线', 1, 'pipeline.pipeline.view'), (14, '新建流水线', 2, 'pipeline.pipeline.add'), (14, '编辑流水线', 3, 'pipeline.pipeline.edit'), (14, '删除流水线', 4, 'pipeline.pipeline.del'), (14, '执行流水线', 5, 'pipeline.pipeline.do'),

        ]
        for pid, name, order, perms in buttons:
            Menu.objects.create(parent_id=pid, menu_name=name, menu_type='F', order_num=order, perms=perms, visible='0')
        self.stdout.write('  Seeded menus')
