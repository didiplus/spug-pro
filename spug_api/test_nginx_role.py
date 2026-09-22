# -*- coding: utf-8 -*-
"""reshma229.nginx-role 手动测试脚本

运行方式:
    cd spug_api && python test_nginx_role.py

验证范围: spug 解析链路(目录定位/结构校验/meta 解析/变量 schema/
Role 记录同步/prepare_roles 复制路径/部署 Playbook 安全校验)。
真实执行需目标主机, 请在 role 市场界面操作。
"""
import os
import sys
import shutil
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'spug.settings')

import django

django.setup()

from apps.ansible.services.role_meta import (
    validate_role_structure, parse_meta, parse_defaults_with_hints,
    parse_readme,
)
from apps.ansible.services.runner import prepare_roles
from apps.ansible.security import validate_playbook_content, sanitize_playbook_roles
from apps.ansible.models import RoleSource
from apps.ansible.views.role import (
    _get_role_base_dir, _find_galaxy_install_path, _sync_role_record,
)
import yaml

results = []


def check(name, cond, detail=''):
    results.append((name, bool(cond), str(detail)))
    mark = 'PASS' if cond else 'FAIL'
    line = f'  [{mark}] {name}'
    if detail:
        line += f'  ({detail})'
    print(line)


ROLE_NAME = 'nginx-role'
NAMESPACE = 'reshma229'

print('\n[1] Role 目录定位 (_find_galaxy_install_path)')
base = _get_role_base_dir()
role_dir = _find_galaxy_install_path(base, NAMESPACE, ROLE_NAME)
check('定位到 role 目录', role_dir is not None, role_dir or f'{base} 下未找到')

print('\n[2] 目录结构校验 (validate_role_structure)')
valid, verr = validate_role_structure(role_dir)
check('tasks/main.yml 存在且结构合规', valid, verr or '')

print('\n[3] meta/main.yml 解析 (parse_meta, 含 galaxy_tags 修复验证)')
meta = parse_meta(role_dir)
check("author == 'nginx'", meta.get('author') == 'nginx', repr(meta.get('author')))
check('description 正确',
      meta.get('description') == 'this is going to configure nginx and copy index.html')
check("min_ansible_version == '2.1'", meta.get('min_ansible_version') == '2.1')
check('galaxy_tags 空列表 -> categories 为空串', meta.get('categories') == '',
      repr(meta.get('categories')))
check('platforms == []', meta.get('platforms') == [])
check('dependencies == []', meta.get('dependencies') == [])

print('\n[4] defaults/main.yml 解析 (变量表单 schema)')
schema = parse_defaults_with_hints(role_dir)
check('schema 为空(defaults 未定义变量, 部署表单无可填项)', schema == [], f'{len(schema)} 项')

print('\n[5] README 解析')
readme = parse_readme(role_dir)
check('README 可读取', bool(readme), f'{len(readme or "")} 字符')

rs = RoleSource.objects.filter(source_type='galaxy', name=ROLE_NAME).first()
print('\n[6] Role 记录同步 (_sync_role_record)')
if rs:
    role = _sync_role_record(rs)
    check('Role 记录存在且 is_active', role is not None and role.is_active,
          f'id={role.id}')
    check('Role.path 指向实际目录', os.path.isdir(role.path), role.path)
else:
    print('  [SKIP] 未找到 galaxy 类型的 RoleSource 记录, 请先在 role 市场安装')

print('\n[7] prepare_roles 复制到 <tmpdir>/project/roles/')
if rs:
    tmpdir = tempfile.mkdtemp(prefix='spug_test_role_')
    try:
        os.makedirs(os.path.join(tmpdir, 'project'), exist_ok=True)
        prepare_roles([ROLE_NAME], tmpdir)
        dest = os.path.join(tmpdir, 'project', 'roles', ROLE_NAME, 'tasks', 'main.yml')
        check('role 已复制到 project/roles/nginx-role/tasks/main.yml', os.path.isfile(dest))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
else:
    print('  [SKIP] 无 RoleSource 记录')

print('\n[8] 部署临时 Playbook 安全校验')
pb_content = yaml.safe_dump(
    [{'hosts': 'all', 'roles': [ROLE_NAME]}], default_flow_style=False)
ok, sec_err = validate_playbook_content(pb_content)
check('validate_playbook_content 通过', ok, sec_err or '')
ok2, role_err, used = sanitize_playbook_roles(pb_content, {ROLE_NAME})
check('sanitize_playbook_roles 通过', ok2, role_err or '')
check('提取的 role 名一致', used == {ROLE_NAME}, repr(used))

print('\n[9] ansible 执行环境')
ap = shutil.which('ansible-playbook')
ag = shutil.which('ansible-galaxy')
check('ansible-playbook 在 PATH', ap is not None, ap or '未安装')
check('ansible-galaxy 在 PATH', ag is not None, ag or '未安装')

print('\n[10] role 自身已知问题 (非 spug 缺陷)')
print('  - vars/main.yml: "trainer name: reshma" 变量名含空格, 非法')
print('  - 模板引用 {{ trainingcentername }}/{{ trainername }} 与 vars 定义')
print('    (trainingcentreName / trainer name) 三处变量名均不匹配')
print('  - templates/index.html.j2 首行 </>h1> 标签错误')
print('  -> 预期执行结果: task1 安装 nginx 成功; task2 template 报')
print('     undefined variable 失败; task3 因 task2 失败被跳过')

failed = [r for r in results if not r[1]]
print(f'\n========== 结果: {len(results) - len(failed)}/{len(results)} 通过 ==========')
for name, _ok, detail in failed:
    print(f'  [FAIL] {name}  ({detail})')
sys.exit(1 if failed else 0)