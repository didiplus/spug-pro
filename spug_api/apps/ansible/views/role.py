# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.views.generic import View
from django.conf import settings
from django.db import transaction
from libs import json_response, JsonParser, Argument, human_datetime, auth
from apps.ansible.models import Role, RoleSource, RoleDeployment
from apps.ansible.services.role_meta import (
    parse_github_url, parse_repo_url, validate_branch,
    preflight_check, RoleMetaError,
    git_clone, git_pull, extract_role_metadata, validate_role_structure,
)
from apps.ansible.models import Playbook, PlaybookRun
from apps.account.utils import has_host_perm
from apps.setting.utils import AppSetting
import subprocess
import uuid
import json
import shutil
import os
import yaml


class RoleView(View):
    @auth('ansible.role.view')
    def get(self, request):
        roles = Role.objects.all()
        return json_response([r.to_dict() for r in roles])

    @auth('ansible.role.edit')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
            Argument('name', help='请输入 Role 名称'),
            Argument('desc', required=False),
            Argument('path', help='请输入 Role 路径'),
            Argument('requirements', required=False),
        ).parse(request.body)
        if error is None:
            if form.id:
                Role.objects.filter(pk=form.id).update(**form)
            else:
                Role.objects.create(created_by=request.user, **form)
        return json_response(error=error)

    @auth('ansible.role.edit')
    def patch(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象'),
            Argument('is_active', type=bool, required=False),
        ).parse(request.body, True)
        if error is None:
            Role.objects.filter(pk=form.id).update(**form)
        return json_response(error=error)

    @auth('ansible.role.edit')
    def delete(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象')
        ).parse(request.GET)
        if error is None:
            Role.objects.filter(pk=form.id).delete()
        return json_response(error=error)


class RoleInstallView(View):
    @auth('ansible.role.edit')
    def post(self, request):
        form, error = JsonParser(
            Argument('role_name', help='请输入 Role 名称'),
            Argument('namespace', required=False),
        ).parse(request.body)
        if error is None:
            role_dir = _get_role_base_dir()
            target = form.role_name
            if form.namespace:
                target = f'{form.namespace}.{form.role_name}'
            try:
                result = subprocess.run(
                    ['ansible-galaxy', 'role', 'install', target, '-p', role_dir],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120
                )
                output = result.stdout.decode()
                if result.returncode == 0:
                    actual_path = _find_galaxy_install_path(role_dir, form.namespace, form.role_name)
                    if not actual_path:
                        return json_response(error=f'安装完成但未找到 Role 目录，请检查 {role_dir} 下的安装结果')
                    Role.objects.create(
                        name=form.role_name,
                        desc=f'从 Galaxy 安装: {target}',
                        path=actual_path,
                        created_by=request.user,
                    )
                    return json_response({'output': output, 'success': True})
                return json_response(error=f'安装失败: {output[:500]}')
            except FileNotFoundError:
                return json_response(error='ansible-galaxy 未安装')
            except Exception as e:
                return json_response(error=f'安装失败: {e}')
        return json_response(error=error)


def _get_role_base_dir() -> str:
    """读取 Role 存储根目录；相对路径自动锚定到项目根目录（BASE_DIR）"""
    base = AppSetting.get_default('ansible_role_dir') or settings.ANSIBLE_ROLE_DIR
    if not os.path.isabs(base):
        base = os.path.join(settings.BASE_DIR, base)
    return os.path.normpath(base)


def _build_role_local_path(namespace: str, name: str) -> str:
    base = _get_role_base_dir()
    if namespace:
        return os.path.join(base, f'{namespace}.{name}')
    return os.path.join(base, name)


def _find_galaxy_install_path(base_dir: str, namespace: str, name: str) -> str:
    """ansible-galaxy 可能安装到 namespace.role/ 或 namespace/role/ 目录，查找实际路径"""
    candidates = [
        os.path.join(base_dir, f'{namespace}.{name}') if namespace else None,
        os.path.join(base_dir, name),
        os.path.join(base_dir, namespace, name) if namespace else None,
    ]
    for path in candidates:
        if path and os.path.isdir(path) and os.path.isfile(os.path.join(path, 'tasks', 'main.yml')):
            return path
    for entry in os.listdir(base_dir):
        full = os.path.join(base_dir, entry)
        if not os.path.isdir(full):
            continue
        if name in entry and os.path.isfile(os.path.join(full, 'tasks', 'main.yml')):
            return full
    return None


def _sync_role_record(role_source: RoleSource):
    """确保 RoleSource 对应的 Role 记录存在且 is_active=True，供 run_playbook 复用"""
    role, created = Role.objects.get_or_create(
        name=role_source.name,
        defaults={
            'desc': role_source.description or f'RoleSource #{role_source.id}',
            'path': role_source.local_path,
            'created_by': role_source.created_by,
        },
    )
    if not created:
        Role.objects.filter(pk=role.id).update(
            path=role_source.local_path,
            is_active=True,
        )
    return role


def _do_install_role_source(rs: RoleSource) -> tuple:
    """执行目录预检 + git clone/pull + 解析元数据，返回 (ok, error)"""
    if rs.source_type != 'local':
        try:
            preflight_check(rs.local_path)
        except RoleMetaError as e:
            RoleSource.objects.filter(pk=rs.id).update(
                install_status='failed', install_error=str(e), updated_at=human_datetime(),
            )
            return False, str(e)

    RoleSource.objects.filter(pk=rs.id).update(install_status='installing', install_error=None)
    try:
        if rs.source_type == 'github':
            if os.path.isdir(rs.local_path) and os.path.isdir(os.path.join(rs.local_path, '.git')):
                commit = git_pull(rs.local_path, rs.branch)
            else:
                commit = git_clone(rs.source_url, rs.branch, rs.local_path)
        elif rs.source_type == 'galaxy':
            target = f'{rs.namespace}.{rs.name}' if rs.namespace else rs.name
            if os.path.isdir(rs.local_path):
                shutil.rmtree(rs.local_path, ignore_errors=True)
            try:
                result = subprocess.run(
                    ['ansible-galaxy', 'role', 'install', target, '-p', _get_role_base_dir()],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120
                )
            except FileNotFoundError:
                raise RoleMetaError(
                    'ansible-galaxy 命令未安装',
                    hint='请安装 ansible: pip install ansible，或确认 ansible-galaxy 在 PATH 中'
                )
            if result.returncode != 0:
                output = result.stdout.decode(errors='ignore')
                raise RoleMetaError(
                    f'ansible-galaxy install 失败: {output[:300]}',
                    hint='请检查 Role 名称和命名空间是否正确，以及网络是否可访问 Galaxy 仓库'
                )
            if not os.path.isdir(rs.local_path):
                actual_path = _find_galaxy_install_path(_get_role_base_dir(), rs.namespace, rs.name)
                if actual_path:
                    RoleSource.objects.filter(pk=rs.id).update(local_path=actual_path)
                    rs.local_path = actual_path
                else:
                    raise RoleMetaError(
                        f'ansible-galaxy 安装完成但未在预期目录找到 Role: {rs.local_path}',
                        hint=f'请检查 Role 存储目录 {_get_role_base_dir()} 下的实际安装结果'
                    )
            commit = None
        else:
            commit = None

        valid, verr = validate_role_structure(rs.local_path)
        if not valid:
            if rs.source_type == 'local':
                verr = f'{verr}\nRole 存储根目录: {_get_role_base_dir()}\n请检查 系统设置→系统配置 中 ansible_role_dir 的值，或确认 Role 名称与目录名一致。'
            RoleSource.objects.filter(pk=rs.id).update(
                install_status='failed', install_error=verr, installed_commit=commit,
            )
            return False, verr

        meta = extract_role_metadata(rs.local_path)
        RoleSource.objects.filter(pk=rs.id).update(
            author=meta.get('author'),
            description=meta.get('description'),
            min_ansible_version=meta.get('min_ansible_version'),
            platforms=json.dumps(meta.get('platforms', [])),
            dependencies=json.dumps(meta.get('dependencies', [])),
            categories=meta.get('categories') or rs.categories,
            variables_schema=json.dumps(meta.get('variables_schema', [])),
            readme=meta.get('readme'),
            installed_commit=commit,
            install_status='installed',
            install_error=None,
            updated_at=human_datetime(),
        )
        _sync_role_record(RoleSource.objects.get(pk=rs.id))
        return True, None
    except RoleMetaError as e:
        RoleSource.objects.filter(pk=rs.id).update(
            install_status='failed', install_error=str(e), updated_at=human_datetime(),
        )
        return False, str(e)
    except Exception as e:
        RoleSource.objects.filter(pk=rs.id).update(
            install_status='failed', install_error=str(e), updated_at=human_datetime(),
        )
        return False, str(e)


def _async_install_role_source(rs_id: int):
    """在后台线程中执行 Role 安装，避免阻塞 HTTP 请求。
    必须通过 transaction.on_commit() 调用，确保 RoleSource 记录已提交到数据库。"""
    import threading
    from django.db import close_old_connections

    def _run():
        try:
            rs = RoleSource.objects.get(pk=rs_id)
            _do_install_role_source(rs)
        except Exception as e:
            RoleSource.objects.filter(pk=rs_id).update(
                install_status='failed', install_error=str(e), updated_at=human_datetime(),
            )
        finally:
            close_old_connections()

    t = threading.Thread(target=_run, daemon=False)
    t.start()


class RoleMarketView(View):
    """Role 应用市场：列表 / 添加源"""

    @auth('ansible.role.view')
    def get(self, request):
        category = request.GET.get('category')
        qs = RoleSource.objects.all()
        if category:
            qs = qs.filter(categories__icontains=category)
        return json_response([r.to_view() for r in qs])

    @auth('ansible.role.edit')
    def post(self, request):
        form, error = JsonParser(
            Argument('source_url', required=False),
            Argument('name', required=False),
            Argument('branch', default='main'),
            Argument('source_type', default='github'),
            Argument('namespace', required=False),
            Argument('categories', required=False),
            Argument('auto_install', type=bool, default=True),
        ).parse(request.body)
        if error is not None:
            return json_response(error=error)

        is_local = form.source_type == 'local'
        is_galaxy = form.source_type == 'galaxy'

        if form.source_type == 'github':
            if not form.source_url:
                return json_response(error='请输入源地址')
            try:
                validate_branch(form.branch)
            except RoleMetaError as e:
                return json_response(error=str(e))
            parsed = parse_github_url(form.source_url) or parse_repo_url(form.source_url)
            if not parsed:
                return json_response(error='无效的 git 仓库地址（支持 GitHub/GitLab 等标准 git URL）')
            ns, repo = parsed
            namespace = form.namespace or ns
            name = form.name or repo
            if not name:
                return json_response(error='无法从地址解析 Role 名称，请手动填写')
        elif is_galaxy:
            name = form.name
            namespace = form.namespace or None
            if not name:
                return json_response(error='请输入 Role 名称')
        elif is_local:
            name = form.name
            namespace = None
            if not name:
                return json_response(error='本地类型必须填写 Role 名称（对应 storage/roles/<名称> 目录）')
        else:
            return json_response(error='不支持的源类型')

        if is_local:
            if RoleSource.objects.filter(source_type='local', name=name).exists():
                return json_response(error=f'本地 Role「{name}」已存在')
        elif is_galaxy:
            if RoleSource.objects.filter(source_type='galaxy', name=name, namespace=namespace).exists():
                return json_response(error=f'Galaxy Role「{(namespace + ".") if namespace else ""}{name}」已存在')
        else:
            if RoleSource.objects.filter(source_url=form.source_url, branch=form.branch).exists():
                return json_response(error='该源已存在')

        local_path = _build_role_local_path(namespace, name)
        if is_local:
            source_url = f'local://{name}'
        elif is_galaxy:
            target = f'{namespace}.{name}' if namespace else name
            source_url = f'galaxy://{target}'
        else:
            source_url = form.source_url

        rs = RoleSource.objects.create(
            name=name,
            source_type=form.source_type,
            source_url=source_url,
            branch=form.branch,
            namespace=namespace,
            categories=form.categories,
            local_path=local_path,
            created_by=request.user,
        )
        if form.auto_install:
            transaction.on_commit(lambda: _async_install_role_source(rs.id))
            rs.refresh_from_db()
        return json_response(rs.to_view())


class RoleMarketDetailView(View):
    """Role 源详情 / 删除"""

    @auth('ansible.role.view')
    def get(self, request, rid):
        rs = RoleSource.objects.filter(pk=rid).first()
        if not rs:
            return json_response(error='Role 源不存在')
        return json_response(rs.to_detail())

    @auth('ansible.role.edit')
    def delete(self, request, rid):
        rs = RoleSource.objects.filter(pk=rid).first()
        if not rs:
            return json_response(error='Role 源不存在')
        if rs.local_path and os.path.isdir(rs.local_path):
            role_base = _get_role_base_dir()
            abs_local = os.path.abspath(rs.local_path)
            abs_base = os.path.abspath(role_base)
            if not abs_local.startswith(abs_base + os.sep):
                return json_response(error=f'安全拦截：本地路径不在 Role 存储目录下，拒绝删除: {rs.local_path}')
            shutil.rmtree(rs.local_path, ignore_errors=True)
        Role.objects.filter(name=rs.name).delete()
        rs.delete()
        return json_response()


class RoleMarketInstallView(View):
    """安装/更新 Role 源"""

    @auth('ansible.role.edit')
    def post(self, request, rid):
        rs = RoleSource.objects.filter(pk=rid).first()
        if not rs:
            return json_response(error='Role 源不存在')
        if rs.install_status == 'installing':
            return json_response(error='正在安装中，请稍候')
        RoleSource.objects.filter(pk=rid).update(install_status='installing', install_error=None)
        transaction.on_commit(lambda: _async_install_role_source(rs.id))
        return json_response(RoleSource.objects.get(pk=rid).to_view())


class RoleMarketDeployView(View):
    """一键部署 Role：生成临时 Playbook + 入队执行"""

    @auth('ansible.role.run')
    def post(self, request, rid):
        form, error = JsonParser(
            Argument('name', help='请输入部署名称'),
            Argument('host_ids', type=list, filter=lambda x: len(x), help='请选择目标主机'),
            Argument('group_id', type=int, required=False),
            Argument('variables', type=dict, default={}),
            Argument('check_mode', type=bool, default=False),
        ).parse(request.body)
        if error is not None:
            return json_response(error=error)

        rs = RoleSource.objects.filter(pk=rid).first()
        if not rs:
            return json_response(error='Role 源不存在')
        if rs.install_status != 'installed':
            return json_response(error='Role 尚未安装，请先安装')
        if not has_host_perm(request.user, form.host_ids):
            return json_response(error='无权访问主机，请联系管理员')

        role = _sync_role_record(rs)

        pb_content = yaml.safe_dump([{
            'hosts': 'all',
            'roles': [rs.name],
        }], default_flow_style=False)

        token = uuid.uuid4().hex
        form.host_ids.sort()
        with transaction.atomic():
            playbook = Playbook.objects.create(
                name=f'[Role部署] {form.name}',
                desc=f'RoleSource #{rs.id} {rs.name}',
                content=pb_content,
                group_id=form.group_id,
                created_by=request.user,
            )
            deployment = RoleDeployment.objects.create(
                role_source=rs,
                name=form.name,
                host_ids=json.dumps(form.host_ids),
                group_id=form.group_id,
                variables=json.dumps(form.variables),
                run_token=token,
                status='running',
                created_by=request.user,
            )
            run = PlaybookRun.objects.create(
                playbook=playbook,
                user=request.user,
                token=token,
                host_ids=json.dumps(form.host_ids),
                extra_vars=json.dumps(form.variables),
                check_mode=form.check_mode,
            )

        from django_redis import get_redis_connection
        from django.conf import settings

        rds = get_redis_connection()
        payload = json.dumps({
            'run_id': run.id,
            'token': token,
            'playbook_id': playbook.id,
            'host_ids': form.host_ids,
            'extra_vars': form.variables,
            'check_mode': form.check_mode,
        })
        transaction.on_commit(lambda: rds.rpush(settings.PLAYBOOK_WORKER_KEY, payload))
        return json_response({'token': token, 'deployment_id': deployment.id})


class RoleDeploymentView(View):
    """Role 部署记录列表"""

    @auth('ansible.role.view')
    def get(self, request):
        deployments = RoleDeployment.objects.select_related('role_source').all()
        return json_response([d.to_view() for d in deployments])