# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
"""Role 元数据解析工具：git clone + 解析 meta/main.yml + defaults/main.yml + README"""
import subprocess
import os
import re
import logging

logger = logging.getLogger(__name__)

_GITHUB_RE = re.compile(r'github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?/?$', re.IGNORECASE)


def parse_github_url(url: str):
    """解析 GitHub URL，返回 (namespace, repo_name) 或 None"""
    m = _GITHUB_RE.search(url)
    if not m:
        return None
    return m.group(1), m.group(2)


def git_clone(url: str, branch: str, dest: str, timeout: int = 120) -> str:
    """浅克隆 GitHub 仓库到 dest，返回 commit hash；失败抛异常"""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest):
        subprocess.run(['rm', '-rf', dest], check=False, timeout=30)
    cmd = ['git', 'clone', '--depth', '1', '-b', branch, url, dest]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f'git clone 失败: {result.stdout.decode(errors="ignore")[:500]}')
    commit = subprocess.run(
        ['git', 'rev-parse', 'HEAD'], cwd=dest,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10
    ).stdout.decode().strip()
    return commit


def git_pull(dest: str, branch: str, timeout: int = 120) -> str:
    """更新已克隆仓库，返回新 commit hash"""
    result = subprocess.run(
        ['git', 'pull', 'origin', branch],
        cwd=dest, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout
    )
    if result.returncode != 0:
        raise RuntimeError(f'git pull 失败: {result.stdout.decode(errors="ignore")[:500]}')
    commit = subprocess.run(
        ['git', 'rev-parse', 'HEAD'], cwd=dest,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10
    ).stdout.decode().strip()
    return commit


def _load_yaml(path: str):
    if not os.path.isfile(path):
        return None
    try:
        import yaml
        with open(path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except Exception as e:
        logger.warning(f'解析 YAML 失败 {path}: {e}')
        return None


def _read_file(path: str) -> str:
    if not os.path.isfile(path):
        return None
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception:
        return None


def parse_meta(role_dir: str) -> dict:
    """解析 meta/main.yml，返回 Galaxy 标准元数据"""
    meta = _load_yaml(os.path.join(role_dir, 'meta', 'main.yml')) or {}
    galaxy_info = meta.get('galaxy_info', {}) if isinstance(meta, dict) else {}

    platforms = galaxy_info.get('platforms', [])
    plat_list = []
    for p in platforms or []:
        if isinstance(p, dict):
            plat_list.append({
                'os': p.get('name', ''),
                'versions': p.get('versions', []),
            })

    deps = meta.get('dependencies', []) if isinstance(meta, dict) else []
    dep_list = []
    for d in deps or []:
        if isinstance(d, str):
            dep_list.append({'name': d})
        elif isinstance(d, dict):
            dep_list.append(d)

    categories = galaxy_info.get('categories', galaxy_info.get('tags', []))
    if isinstance(categories, list):
        categories = ','.join(str(c) for c in categories)

    return {
        'author': galaxy_info.get('author'),
        'description': galaxy_info.get('description'),
        'min_ansible_version': galaxy_info.get('min_ansible_version'),
        'platforms': plat_list,
        'dependencies': dep_list,
        'categories': categories,
    }


def _guess_type(value):
    """根据默认值推断变量类型"""
    if isinstance(value, bool):
        return 'bool'
    if isinstance(value, int):
        return 'int'
    if isinstance(value, float):
        return 'float'
    if isinstance(value, (list, dict)):
        return 'json'
    return 'string'


def _make_label(key: str) -> str:
    """变量名转可读 label：nginx_port → Nginx Port"""
    return ' '.join(w.capitalize() for w in key.split('_') if w)


_SPUG_HINT_RE = re.compile(r'#\s*SPUG:\s*(.*)', re.IGNORECASE)


def parse_defaults(role_dir: str) -> list:
    """解析 defaults/main.yml，生成变量表单 schema

    支持 # SPUG: label=端口,required=true 行内注释扩展
    """
    defaults = _load_yaml(os.path.join(role_dir, 'defaults', 'main.yml'))
    if not defaults or not isinstance(defaults, dict):
        return []

    schema = []
    for key, value in defaults.items():
        item = {
            'key': key,
            'type': _guess_type(value),
            'default': value,
            'label': _make_label(key),
            'required': False,
        }
        schema.append(item)
    return schema


def parse_defaults_with_hints(role_dir: str) -> list:
    """解析 defaults/main.yml 并提取 # SPUG: 行内注释增强 schema"""
    path = os.path.join(role_dir, 'defaults', 'main.yml')
    if not os.path.isfile(path):
        return []
    schema = parse_defaults(role_dir)

    hints = {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                m = _SPUG_HINT_RE.search(line)
                if not m:
                    continue
                key_match = re.match(r'^(\w+):', line)
                if not key_match:
                    continue
                k = key_match.group(1)
                attrs = {}
                for part in m.group(1).split(','):
                    if '=' in part:
                        ak, av = part.split('=', 1)
                        attrs[ak.strip()] = av.strip()
                    else:
                        attrs[part.strip()] = True
                hints[k] = attrs
    except Exception:
        pass

    for item in schema:
        hint = hints.get(item['key'])
        if not hint:
            continue
        if 'label' in hint:
            item['label'] = hint['label']
        if 'required' in hint:
            item['required'] = True
        if 'type' in hint:
            item['type'] = hint['type']
    return schema


def parse_readme(role_dir: str) -> str:
    """读取 README.md"""
    for name in ('README.md', 'README.rst', 'README.txt', 'README'):
        content = _read_file(os.path.join(role_dir, name))
        if content:
            return content
    return None


def extract_role_metadata(role_dir: str) -> dict:
    """一键提取 role 全部元数据，返回合并字典"""
    meta = parse_meta(role_dir)
    schema = parse_defaults_with_hints(role_dir)
    readme = parse_readme(role_dir)
    return {
        'author': meta.get('author'),
        'description': meta.get('description'),
        'min_ansible_version': meta.get('min_ansible_version'),
        'platforms': meta.get('platforms', []),
        'dependencies': meta.get('dependencies', []),
        'categories': meta.get('categories'),
        'variables_schema': schema,
        'readme': readme,
    }


def validate_role_structure(role_dir: str) -> tuple:
    """校验 role 目录结构是否符合规范，返回 (is_valid, error)"""
    if not os.path.isdir(role_dir):
        return False, f'目录不存在: {role_dir}'
    required = [
        os.path.join('tasks', 'main.yml'),
    ]
    for rel in required:
        if not os.path.isfile(os.path.join(role_dir, rel)):
            return False, f'缺少必需文件: {rel}'
    return True, None