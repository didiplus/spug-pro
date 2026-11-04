# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.views.generic import View
from django.db import transaction
from django.http import HttpResponse
from libs import json_response, JsonParser, Argument, human_datetime, auth
from apps.ansible.models import InventoryGroup, HostVariable
from apps.host.models import Host
import json
import yaml


class InventoryView(View):
    @auth('ansible.inventory.view')
    def get(self, request):
        groups = InventoryGroup.objects.prefetch_related('hosts').all()
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
            with transaction.atomic():
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
            with transaction.atomic():
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
        groups = InventoryGroup.objects.prefetch_related('hosts').all().order_by('-sort_id')
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
            with transaction.atomic():
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

class InventoryExportView(View):
    @auth('ansible.inventory.view')
    def get(self, request):
        fmt = request.GET.get('format', 'ini')
        group_id = request.GET.get('group_id')
        preview = request.GET.get('preview')

        groups = InventoryGroup.objects.prefetch_related('hosts').all()
        if group_id:
            groups = groups.filter(id=group_id)

        host_ids = set()
        for g in groups:
            for h in g.hosts.all():
                host_ids.add(h.id)

        host_vars = {}
        for hv in HostVariable.objects.filter(host_id__in=host_ids):
            host_vars.setdefault(hv.host_id, {})[hv.key] = hv.value

        if fmt == 'yaml':
            content = self._build_yaml(groups, host_vars)
        else:
            content = self._build_ini(groups, host_vars)

        if preview:
            return json_response({'content': content, 'format': fmt})

        response = HttpResponse(content, content_type='text/plain; charset=utf-8')
        filename = f'inventory.{fmt}'
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    def _build_ini(self, groups, host_vars):
        lines = []
        for g in groups:
            lines.append(f'[{g.name}]')
            for h in g.hosts.all():
                parts = [h.name]
                parts.append(f'ansible_host={h.hostname}')
                if h.port and h.port != 22:
                    parts.append(f'ansible_port={h.port}')
                if h.username:
                    parts.append(f'ansible_user={h.username}')
                for k, v in host_vars.get(h.id, {}).items():
                    parts.append(f'{k}={v}')
                lines.append(' '.join(parts))
            lines.append('')
            variables = json.loads(g.variables) if g.variables else {}
            if variables:
                lines.append(f'[{g.name}:vars]')
                for k, v in variables.items():
                    lines.append(f'{k}={v}')
                lines.append('')
        return '\n'.join(lines)

    def _build_yaml(self, groups, host_vars):
        inventory = {'all': {'children': {}}}
        for g in groups:
            group_data = {'hosts': {}}
            for h in g.hosts.all():
                hv = {'ansible_host': h.hostname}
                if h.port and h.port != 22:
                    hv['ansible_port'] = h.port
                if h.username:
                    hv['ansible_user'] = h.username
                hv.update(host_vars.get(h.id, {}))
                group_data['hosts'][h.name] = hv
            variables = json.loads(g.variables) if g.variables else {}
            if variables:
                group_data['vars'] = variables
            inventory['all']['children'][g.name] = group_data
        return yaml.safe_dump(inventory, default_flow_style=False, allow_unicode=True)