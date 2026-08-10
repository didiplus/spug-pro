# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.views.generic import View
from libs import json_response, JsonParser, Argument, human_datetime, auth
from apps.ansible.models import InventoryGroup, HostVariable, VaultSecret, HostFacts
from apps.playbook.models import Role
from apps.host.models import Host
from apps.account.models import User
from apps.setting.utils import AppSetting
from libs.crypto import encrypt, decrypt
import subprocess
import tempfile
import json


class InventoryView(View):
    @auth('ansible.inventory.view')
    def get(self, request):
        groups = InventoryGroup.objects.all()
        result = []
        for g in groups:
            item = g.to_view(with_hosts=True)
            item['parent_id'] = g.parent_id
            result.append(item)
        return json_response(result)

    @auth('ansible.inventory.edit')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
            Argument('name', help='请输入分组名称'),
            Argument('parent_id', type=int, required=False),
            Argument('variables', type=dict, handler=json.dumps, default={}),
            Argument('children_pattern', required=False),
            Argument('sort_id', type=int, default=0),
            Argument('host_ids', type=list, default=[]),
        ).parse(request.body)
        if error is None:
            host_ids = form.pop('host_ids')
            if form.id:
                group = InventoryGroup.objects.filter(pk=form.id).first()
                if not group:
                    return json_response(error='分组不存在')
                InventoryGroup.objects.filter(pk=form.id).update(**form)
                group.hosts.set(host_ids)
            else:
                group = InventoryGroup.objects.create(**form)
                group.hosts.set(host_ids)
            return json_response(group.to_view(with_hosts=True))
        return json_response(error=error)

    @auth('ansible.inventory.edit')
    def patch(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象'),
            Argument('name', required=False),
            Argument('parent_id', type=int, required=False),
            Argument('variables', type=dict, handler=json.dumps, required=False),
            Argument('children_pattern', required=False),
            Argument('sort_id', type=int, required=False),
            Argument('host_ids', type=list, required=False),
        ).parse(request.body, True)
        if error is None:
            host_ids = form.pop('host_ids', None)
            InventoryGroup.objects.filter(pk=form.id).update(**form)
            if host_ids is not None:
                group = InventoryGroup.objects.get(pk=form.id)
                group.hosts.set(host_ids)
        return json_response(error=error)

    @auth('ansible.inventory.edit')
    def delete(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象')
        ).parse(request.GET)
        if error is None:
            InventoryGroup.objects.filter(pk=form.id).delete()
        return json_response(error=error)


class InventoryTreeView(View):
    @auth('ansible.inventory.view')
    def get(self, request):
        groups = InventoryGroup.objects.all().order_by('-sort_id')
        group_map = {}
        for g in groups:
            item = {
                'key': g.id,
                'title': g.name,
                'parent_id': g.parent_id,
                'children': [],
                'host_ids': [h.id for h in g.hosts.all()],
            }
            group_map[g.id] = item
        tree = []
        for g in groups:
            item = group_map[g.id]
            if g.parent_id and g.parent_id in group_map:
                group_map[g.parent_id]['children'].append(item)
            else:
                tree.append(item)
        return json_response(tree)


class HostVarView(View):
    @auth('ansible.inventory.view')
    def get(self, request, host_id):
        host = Host.objects.filter(pk=host_id).first()
        if not host:
            return json_response(error='主机不存在')
        variables = HostVariable.objects.filter(host_id=host_id)
        return json_response({
            'host': host.to_dict(),
            'variables': [v.to_view() for v in variables],
        })

    @auth('ansible.inventory.edit')
    def post(self, request, host_id):
        form, error = JsonParser(
            Argument('key', help='请输入变量名'),
            Argument('value', help='请输入变量值'),
            Argument('value_type', default='string'),
            Argument('is_vault', type=bool, default=False),
        ).parse(request.body)
        if error is None:
            if form.value_type == 'json':
                form.value = json.dumps(form.value) if not isinstance(form.value, str) else form.value
            elif form.value_type == 'bool':
                form.value = 'true' if form.value else 'false'
            elif form.value_type == 'int':
                form.value = str(form.value)
            obj, created = HostVariable.objects.get_or_create(
                host_id=host_id, key=form.key,
                defaults={'value': form.value, 'value_type': form.value_type, 'is_vault': form.is_vault}
            )
            if not created:
                obj.value = form.value
                obj.value_type = form.value_type
                obj.is_vault = form.is_vault
                obj.updated_at = human_datetime()
                obj.save()
        return json_response(error=error)

    @auth('ansible.inventory.edit')
    def patch(self, request, host_id):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象'),
            Argument('key', required=False),
            Argument('value', required=False),
            Argument('value_type', required=False),
            Argument('is_vault', type=bool, required=False),
        ).parse(request.body, True)
        if error is None:
            updates = {}
            for k in ('key', 'value_type', 'is_vault'):
                if form.get(k) is not None:
                    updates[k] = form[k]
            if form.get('value') is not None:
                if form.get('value_type') == 'json':
                    updates['value'] = json.dumps(form.value) if not isinstance(form.value, str) else form.value
                elif form.get('value_type') == 'bool':
                    updates['value'] = 'true' if form.value else 'false'
                elif form.get('value_type') == 'int':
                    updates['value'] = str(form.value)
                else:
                    updates['value'] = form.value
            updates['updated_at'] = human_datetime()
            HostVariable.objects.filter(pk=form.id, host_id=host_id).update(**updates)
        return json_response(error=error)

    @auth('ansible.inventory.edit')
    def delete(self, request, host_id):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象')
        ).parse(request.GET)
        if error is None:
            HostVariable.objects.filter(pk=form.id, host_id=host_id).delete()
        return json_response(error=error)


class VaultView(View):
    @auth('ansible.vault.view')
    def get(self, request):
        secrets = VaultSecret.objects.all()
        return json_response([s.to_view() for s in secrets])

    @auth('ansible.vault.edit')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
            Argument('name', help='请输入名称'),
            Argument('key', help='请输入变量名'),
            Argument('value', help='请输入变量值'),
            Argument('vault_id', default='default'),
            Argument('desc', required=False),
        ).parse(request.body)
        if error is None:
            encrypted = encrypt(form.value)
            if form.id:
                VaultSecret.objects.filter(pk=form.id).update(
                    name=form.name, key=form.key, encrypted_value=encrypted,
                    vault_id=form.vault_id, desc=form.desc, updated_at=human_datetime(),
                )
            else:
                VaultSecret.objects.create(
                    name=form.name, key=form.key, encrypted_value=encrypted,
                    vault_id=form.vault_id, desc=form.desc, created_by=request.user,
                )
        return json_response(error=error)

    @auth('ansible.vault.edit')
    def delete(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象')
        ).parse(request.GET)
        if error is None:
            VaultSecret.objects.filter(pk=form.id).delete()
        return json_response(error=error)


class VaultDecryptView(View):
    @auth('ansible.vault.view')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定 Vault 密钥'),
        ).parse(request.body)
        if error is None:
            secret = VaultSecret.objects.filter(pk=form.id).first()
            if not secret:
                return json_response(error='Vault 密钥不存在')
            try:
                value = decrypt(secret.encrypted_value)
                return json_response({'key': secret.key, 'value': value})
            except Exception as e:
                return json_response(error=f'解密失败: {e}')
        return json_response(error=error)


class FactsView(View):
    @auth('ansible.facts.view')
    def get(self, request, host_id=None):
        if host_id:
            facts = HostFacts.objects.filter(host_id=host_id).first()
            if not facts:
                return json_response(error='该主机暂无 Facts 缓存')
            return json_response(facts.to_view())
        facts_list = HostFacts.objects.select_related('host').all()
        result = []
        for f in facts_list:
            item = f.to_view()
            item['host'] = {'id': f.host_id, 'name': f.host.name, 'hostname': f.host.hostname}
            result.append(item)
        return json_response(result)


class FactsCollectView(View):
    @auth('ansible.facts.collect')
    def post(self, request):
        form, error = JsonParser(
            Argument('host_ids', type=list, filter=lambda x: len(x), help='请选择目标主机'),
        ).parse(request.body)
        if error is None:
            from django_redis import get_redis_connection
            from django.conf import settings
            token = __import__('uuid').uuid4().hex
            rds = get_redis_connection()
            rds.rpush(getattr(settings, 'FACTS_WORKER_KEY', 'spug:facts:worker'), json.dumps({
                'token': token,
                'host_ids': form.host_ids,
            }))
            return json_response(token)
        return json_response(error=error)


MODULE_CATEGORIES = {
    "files": ["copy", "file", "fetch", "synchronize", "archive", "unarchive",
              "template", "blockinfile", "lineinfile", "replace", "stat"],
    "packages": ["yum", "apt", "dnf", "pip", "gem", "npm", "package"],
    "services": ["systemd", "service", "sysvinit", "supervisorctl"],
    "network": ["uri", "get_url", "slurp"],
    "commands": ["shell", "command", "raw", "script"],
    "system": ["user", "group", "cron", "hostname", "timezone", "sysctl",
               "mount", "authorized_key", "known_hosts"],
    "monitoring": ["setup", "debug", "assert", "fail", "wait_for", "pause"],
}


class ModuleView(View):
    @auth('ansible.modules.view')
    def get(self, request, name=None):
        if name:
            try:
                result = subprocess.run(
                    ['ansible-doc', '--json', name],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10
                )
                if result.returncode == 0:
                    doc = json.loads(result.stdout.decode())
                    return json_response(doc)
                return json_response(error=f'获取模块文档失败: {result.stderr.decode()[:200]}')
            except FileNotFoundError:
                return json_response(error='ansible-doc 未安装')
            except Exception as e:
                return json_response(error=f'获取模块文档失败: {e}')
        return json_response({
            'categories': MODULE_CATEGORIES,
            'modules': [m for mods in MODULE_CATEGORIES.values() for m in mods],
        })


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
            role_dir = AppSetting.get_default('ansible_role_dir') or '/data/roles'
            target = form.role_name
            if form.namespace:
                target = f'{form.namespace}.{form.role_name}'
            try:
                result = subprocess.run(
                    ['ansible-galaxy', 'install', target, '-p', role_dir],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120
                )
                output = result.stdout.decode()
                if result.returncode == 0:
                    Role.objects.create(
                        name=form.role_name,
                        desc=f'从 Galaxy 安装: {target}',
                        path=f'{role_dir}/{form.role_name}',
                        created_by=request.user,
                    )
                    return json_response({'output': output, 'success': True})
                return json_response(error=f'安装失败: {output[:500]}')
            except FileNotFoundError:
                return json_response(error='ansible-galaxy 未安装')
            except Exception as e:
                return json_response(error=f'安装失败: {e}')
        return json_response(error=error)
