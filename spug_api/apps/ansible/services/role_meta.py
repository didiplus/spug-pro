# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
"""Role 仓库服务：git 同步（预检/错误分类）+ 元数据解析 + 结构校验"""
import os
import re
import shutil
import subprocess
import logging

logger = logging.getLogger(__name__)

_GITHUB_RE = re.compile(r'github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?/?$', re.IGNORECASE)
_GIT_URL_RE = re.compile(r'^(https?://|git@|ssh://)[^\s]+$', re.IGNORECASE)
_BRANCH_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$')

# git 失败输出分类：(模式, 错误摘要, 修复建议)
_GIT_ERROR_PATTERNS = [
    (re.compile(r'Permission denied.*publickey', re.I),
     'SSH 认证失败',
     '请为运行用户配置可访问该仓库的 SSH 私钥，或改用 HTTPS 地址'),
    (re.compile(r'Authentication failed|403 Forbidden|401 Unauthorized', re.I),
     '认证失败',
     '检查仓库访问凭证是否有效、账号是否有该仓库读取权限'),
    (re.compile(r'not found|does not appear to be a git repository', re.I),
     '仓库不存在或无权访问',
     '确认仓库地址拼写是否正确、私有仓库是否已配置凭证'),
    (re.compile(r"couldn't find remote ref|Remote branch .* not found", re.I),
     '分支或 Tag 不存在',
     '确认分支名是否正确，可在浏览器访问 仓库地址/tree/<分支> 验证'),
    (re.compile(r'Could not resolve host|timed out|Connection refused|Network is unreachable|Failed to connect', re.I),
     '网络连接失败',
     '检查部署机到代码仓库的网络连通性、DNS 解析与代理配置'),
    (re.compile(r'ssl|certificate verify failed', re.I),
     'TLS 证书校验失败',
     '自签名证书仓库可执行 git config --global http.sslVerify false，或导入 CA 证书'),
]


class RoleMetaError(Exception):
    """带修复建议的 Role 仓库错误，install_error 直接落库 str(e) 即可展示建议"""
    def __init__(self, message, hint=None):
        super().__init__(message)
        self.message = message
        self.hint = hint

    def __str__(self):
        if self.hint:
            return f'{self.message}\n修复建议: {self.hint}'
        return self.message


def _classify_git_error(output: str, default_msg: str) -> RoleMetaError:
    for pattern, message, hint in _GIT_ERROR_PATTERNS:
        if pattern.search(output):
            return RoleMetaError(message, hint)
    return RoleMetaError(default_msg, output.strip()[:300] or None)


def preflight_check(local_path: str) -> None:
    """安装前目录预检：目标父目录必须存在或可创建且可写，否则抛带建议的 RoleMetaError"""
    parent = os.path.dirname(os.path.normpath(local_path))
    if os.path.isdir(parent):
        if not os.access(parent, os.W_OK | os.X_OK):
            raise RoleMetaError(
                f'目录 {parent} 不可写',
                hint='请为运行用户授权（chown/chmod），或在 系统设置→系统配置 中将 ansible_role_dir 改为有权限的路径（如 /opt/spug/roles）'
            )
        return
    probe = parent
    while probe and probe != os.sep and not os.path.isdir(probe):
        probe = os.path.dirname(probe)
    if not probe or not os.access(probe, os.W_OK | os.X_OK):
        raise RoleMetaError(
            f'父目录 {parent} 不存在且无法创建',
            hint=f'当前运行用户对 {probe or "/"} 没有写权限，请在 系统设置 中修改 ansible_role_dir 为有权限的路径，或手动创建 {parent} 并授权'
        )


def validate_branch(branch: str) -> str:
    """校验分支/Tag 名，防止 git 参数注入"""
    branch = (branch or '').strip()
    if not _BRANCH_RE.match(branch):
        raise RoleMetaError(
            f'非法分支名: {branch!r}',
            hint='分支/Tag 仅允许字母、数字、点、斜杠、下划线、连字符'
        )
    return branch


def parse_github_url(url: str):
    """解析 GitHub URL，返回 (namespace, repo_name) 或 None"""
    m = _GITHUB_RE.search(url or '')
    if not m:
        return None
    return m.group(1), m.group(2)


def parse_repo_url(url: str):
    """解析通用 git 仓库 URL（GitHub/GitLab/Gitea/内网 git），返回 (namespace, name) 或 None"""
    url = (url or '').strip()
    if not _GIT_URL_RE.match(url):
        return None
    github = parse_github_url(url)
    if github:
        return github
    path = re.sub(r'\.git/?$', '', url.split('://')[-1])
    segments = [s for s in path.split('/') if s]
    if len(segments) >= 2:
        return segments[-2], segments[-1]
    if segments:
        return None, segments[-1]
    return None


def _run_git(cmd, cwd=None, timeout=300):
    try:
        return subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise RoleMetaError(
            f'git 命令超时（>{timeout}s）: {" ".join(cmd[:3])}',
            hint='请检查部署机到仓库的网络连通性，或稍后重试'
        )


def _current_commit(dest: str) -> str:
    result = _run_git(['git', 'rev-parse', 'HEAD'], cwd=dest, timeout=10)
    return result.stdout.decode().strip() if result.returncode == 0 else None


def git_clone(url: str, branch: str, dest: str, timeout: int = 300) -> str:
    """浅克隆 git 仓库到 dest，返回 commit hash；失败抛 RoleMetaError"""
    preflight_check(dest)
    branch = validate_branch(branch)
    if os.path.exists(dest):
        shutil.rmtree(dest, ignore_errors=True)
    try:
        os.makedirs(dest, exist_ok=True)
    except OSError as e:
        raise RoleMetaError(
            f'无法创建目录 {dest}: {e.strerror}',
            hint='请检查运行用户写权限，或在 系统设置 中修改 ansible_role_dir'
        ) from e
    result = _run_git(['git', 'clone', '--depth', '1', '--single-branch',
                       '-b', branch, url, dest], timeout=timeout)
    if result.returncode != 0:
        output = result.stderr.decode(errors='ignore') or result.stdout.decode(errors='ignore')
        raise _classify_git_error(output, f'git clone 失败: {output[:300]}')
    return _current_commit(dest)


def git_pull(dest: str, branch: str, timeout: int = 300) -> str:
    """更新已克隆仓库，返回新 commit hash"""
    branch = validate_branch(branch)
    result = _run_git(['git', 'pull', 'origin', branch], cwd=dest, timeout=timeout)
    if result.returncode != 0:
        output = result.stderr.decode(errors='ignore') or result.stdout.decode(errors='ignore')
        raise _classify_git_error(output, f'git pull 失败: {output[:300]}')
    return _current_commit(dest)


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
    if not isinstance(galaxy_info, dict):
        galaxy_info = {}

    plat_list = []
    for p in galaxy_info.get('platforms') or []:
        if isinstance(p, dict):
            plat_list.append({
                'os': p.get('name', ''),
                'versions': p.get('versions', []),
            })

    dep_list = []
    for d in meta.get('dependencies') or []:
        if isinstance(d, str):
            dep_list.append({'name': d})
        elif isinstance(d, dict):
            dep_list.append(d)

    categories = galaxy_info.get('galaxy_tags',
               galaxy_info.get('categories', galaxy_info.get('tags', [])))
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
    """变量名转可读 label：nginx_port → Nginx Port，ssl_port → SSL Port"""
    words = []
    for w in key.split('_'):
        if not w:
            continue
        if len(w) <= 5 and w.isupper():
            words.append(w)
        else:
            words.append(w.capitalize())
    return ' '.join(words) or key


_SPUG_HINT_RE = re.compile(r'#\s*SPUG:\s*(.*)', re.IGNORECASE)
_KEY_RE = re.compile(r'^(\w+)\s*:')


def parse_defaults(role_dir: str) -> list:
    """解析 defaults/main.yml，生成变量表单 schema

    支持 # SPUG: label=端口,required=true 行内注释扩展
    """
    defaults = _load_yaml(os.path.join(role_dir, 'defaults', 'main.yml'))
    if not defaults or not isinstance(defaults, dict):
        return []

    schema = []
    for key, value in defaults.items():
        schema.append({
            'key': key,
            'type': _guess_type(value),
            'default': value,
            'label': _make_label(key),
            'required': False,
        })
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
                key_match = _KEY_RE.match(line)
                if not key_match:
                    continue
                attrs = {}
                for part in m.group(1).split(','):
                    if '=' in part:
                        ak, av = part.split('=', 1)
                        attrs[ak.strip()] = av.strip()
                    elif part.strip():
                        attrs[part.strip()] = True
                hints[key_match.group(1)] = attrs
    except Exception as e:
        logger.warning(f'解析 SPUG hints 失败 {path}: {e}')

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

    if not os.path.isfile(os.path.join(role_dir, 'tasks', 'main.yml')):
        return False, (
            '缺少必需文件: tasks/main.yml。'
            'Role 仓库需符合 Galaxy 规范：tasks/main.yml（入口）为必需，'
            'meta/main.yml 与 defaults/main.yml 建议提供'
        )
    return True, None
