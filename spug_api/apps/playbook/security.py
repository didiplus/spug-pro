# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
"""Playbook 安全检查模块

防止 YAML 注入、限制 include/import 引用外部文件、过滤 extra_vars 敏感变量。
"""
import yaml
import re
import logging

logger = logging.getLogger(__name__)

DANGEROUS_MODULES = {
    'shell',
    'command',
    'raw',
    'script',
}

INCLUDE_DIRECTIVES = {
    'include',
    'import_playbook',
    'include_tasks',
    'import_tasks',
    'include_role',
    'import_role',
}

SENSITIVE_VAR_PATTERNS = [
    re.compile(r'password', re.IGNORECASE),
    re.compile(r'secret', re.IGNORECASE),
    re.compile(r'token', re.IGNORECASE),
    re.compile(r'api_key', re.IGNORECASE),
    re.compile(r'access_key', re.IGNORECASE),
    re.compile(r'private_key', re.IGNORECASE),
    re.compile(r'credential', re.IGNORECASE),
]

EXTRA_VARS_BLOCKED_KEYS = {
    'ansible_password',
    'ansible_ssh_pass',
    'ansible_become_password',
    'ansible_vault_password',
}


def validate_playbook_content(content: str) -> tuple:
    """
    校验 Playbook 内容安全性
    返回 (is_valid, error_message)
    """
    if not content or not content.strip():
        return False, 'Playbook 内容不能为空'

    try:
        parsed = yaml.safe_load(content)
    except yaml.YAMLError as e:
        return False, f'YAML 语法错误: {e}'

    if parsed is None:
        return False, 'Playbook 内容不能为空'

    if not isinstance(parsed, list):
        return False, 'Playbook 内容必须是一个 YAML 列表'

    for i, play in enumerate(parsed):
        if not isinstance(play, dict):
            return False, f'第 {i + 1} 个 play 必须是字典类型'

        if 'hosts' not in play:
            return False, f'第 {i + 1} 个 play 缺少 hosts 字段'

        if 'tasks' not in play and 'roles' not in play:
            return False, f'第 {i + 1} 个 play 缺少 tasks 或 roles 字段'

        err = _check_play_directives(play, i + 1)
        if err:
            return False, err

        if 'tasks' in play:
            err = _check_tasks(play['tasks'], i + 1)
            if err:
                return False, err

        if 'pre_tasks' in play:
            err = _check_tasks(play['pre_tasks'], i + 1, 'pre_tasks')
            if err:
                return False, err

        if 'post_tasks' in play:
            err = _check_tasks(play['post_tasks'], i + 1, 'post_tasks')
            if err:
                return False, err

        if 'handlers' in play:
            err = _check_tasks(play['handlers'], i + 1, 'handlers')
            if err:
                return False, err

    return True, None


def _check_play_directives(play: dict, play_num: int) -> str:
    """检查 play 级别的危险指令"""
    for key in play:
        if key in INCLUDE_DIRECTIVES:
            val = play[key]
            if isinstance(val, str) and _is_external_reference(val):
                return f'第 {play_num} 个 play: {key} 引用了外部文件 "{val}"，只能引用 Spug 管理的 Role'
    return None


def _check_tasks(tasks: list, play_num: int, section: str = 'tasks') -> str:
    """检查任务列表中的安全问题"""
    if not isinstance(tasks, list):
        return f'第 {play_num} 个 play: {section} 必须是列表类型'

    for j, task in enumerate(tasks):
        if not isinstance(task, dict):
            return f'第 {play_num} 个 play: {section}[{j}] 必须是字典类型'

        err = _check_task_directives(task, play_num, section, j)
        if err:
            return err

        err = _check_task_module(task, play_num, section, j)
        if err:
            return err

    return None


def _check_task_directives(task: dict, play_num: int, section: str, task_idx: int) -> str:
    """检查任务中的 include/import 指令"""
    for key in task:
        if key in INCLUDE_DIRECTIVES:
            val = task[key]
            if isinstance(val, str) and _is_external_reference(val):
                return f'第 {play_num} 个 play: {section}[{task_idx}] {key} 引用了外部文件 "{val}"'
            if isinstance(val, dict):
                file_val = val.get('file', '')
                if isinstance(file_val, str) and _is_external_reference(file_val):
                    return f'第 {play_num} 个 play: {section}[{task_idx}] {key} 引用了外部文件 "{file_val}"'
    return None


def _check_task_module(task: dict, play_num: int, section: str, task_idx: int) -> str:
    """检查任务模块安全性"""
    module_keys = [k for k in task if not k.startswith('_') and k not in
                   ('name', 'when', 'become', 'become_user', 'become_method',
                    'register', 'tags', 'ignore_errors', 'changed_when',
                    'failed_when', 'no_log', 'run_once', 'delegate_to',
                    'local_action', 'connection', 'vars', 'loop', 'with_items',
                    'with_dict', 'with_list', 'with_fileglob', 'environment',
                    'retries', 'delay', 'until', 'notify', 'block', 'rescue',
                    'always', 'ansible_loop_var', 'loop_control')]

    for mod_key in module_keys:
        if mod_key in INCLUDE_DIRECTIVES:
            continue

        if mod_key in DANGEROUS_MODULES:
            mod_val = task[mod_key]
            if isinstance(mod_val, str):
                if _has_shell_injection(mod_val):
                    return (f'第 {play_num} 个 play: {section}[{task_idx}] '
                            f'{mod_key} 包含潜在危险的 shell 特殊字符: {mod_val[:50]}')

    return None


def _is_external_reference(ref: str) -> bool:
    """判断引用是否为外部文件路径"""
    if not ref:
        return False
    if ref.startswith('/'):
        return True
    if ref.startswith('..') or ref.startswith('./'):
        return True
    if '://' in ref:
        return True
    if '\\' in ref:
        return True
    if ref.endswith('.yml') or ref.endswith('.yaml'):
        return True
    return False


def _has_shell_injection(cmd: str) -> bool:
    """检测 shell 命令中的危险注入模式"""
    dangerous_patterns = [
        r'\$\([^)]*\)',
        r'`[^`]*`',
        r'\$\{[^}]*\}',
        r'>\s*/dev/',
        r'rm\s+-rf\s+/',
        r'mkfs\.',
        r'dd\s+if=',
        r':\(\)\{.*\};:',
        r'curl\s+.*\|\s*sh',
        r'wget\s+.*\|\s*sh',
    ]
    for pattern in dangerous_patterns:
        if re.search(pattern, cmd):
            return True
    return False


def filter_extra_vars(extra_vars: dict) -> dict:
    """
    过滤 extra_vars，移除敏感变量
    """
    if not extra_vars or not isinstance(extra_vars, dict):
        return {}

    filtered = {}
    for key, value in extra_vars.items():
        if not isinstance(key, str):
            continue

        if key in EXTRA_VARS_BLOCKED_KEYS:
            logger.warning(f'extra_vars 中的敏感变量 "{key}" 已被过滤')
            continue

        if any(p.search(key) for p in SENSITIVE_VAR_PATTERNS):
            logger.warning(f'extra_vars 中的疑似敏感变量 "{key}" 已被过滤')
            continue

        if key.startswith('ansible_'):
            logger.warning(f'extra_vars 中的 ansible 内部变量 "{key}" 已被过滤')
            continue

        filtered[key] = value

    return filtered


def sanitize_playbook_roles(content: str, allowed_role_names: set) -> tuple:
    """
    校验 Playbook 中引用的 Role 是否在允许列表中
    返回 (is_valid, error_message, used_roles)
    """
    try:
        parsed = yaml.safe_load(content)
    except yaml.YAMLError:
        return False, 'YAML 语法错误', set()

    if not isinstance(parsed, list):
        return True, None, set()

    used_roles = set()

    for i, play in enumerate(parsed):
        if not isinstance(play, dict):
            continue

        if 'roles' in play:
            roles = play['roles']
            if not isinstance(roles, list):
                continue
            for role in roles:
                role_name = None
                if isinstance(role, str):
                    role_name = role
                elif isinstance(role, dict):
                    role_name = role.get('role') or role.get('name')

                if role_name:
                    used_roles.add(role_name)
                    if role_name not in allowed_role_names:
                        return (False,
                                f'第 {i + 1} 个 play 引用了未管理的 Role "{role_name}"，'
                                f'请先在 Role 管理中添加',
                                used_roles)

        if 'tasks' in play and isinstance(play['tasks'], list):
            for task in play['tasks']:
                if not isinstance(task, dict):
                    continue
                for directive in ('include_role', 'import_role'):
                    if directive in task:
                        val = task[directive]
                        role_name = None
                        if isinstance(val, str):
                            role_name = val
                        elif isinstance(val, dict):
                            role_name = val.get('name') or val.get('role')
                        if role_name:
                            used_roles.add(role_name)
                            if role_name not in allowed_role_names:
                                return (False,
                                        f'任务引用了未管理的 Role "{role_name}"，'
                                        f'请先在 Role 管理中添加',
                                        used_roles)

    return True, None, used_roles