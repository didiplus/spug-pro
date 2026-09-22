# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.views.generic import View
from django.db import transaction
from django_redis import get_redis_connection
from django.conf import settings
from libs import json_response, JsonParser, Argument, human_datetime, auth
from apps.ansible.models import Playbook, PlaybookRun, PlaybookVersion, Role
from apps.ansible.security import validate_playbook_content, filter_extra_vars, sanitize_playbook_roles
from apps.host.models import Host
from apps.account.utils import has_host_perm
import difflib
import yaml
import uuid
import json


class PlaybookView(View):
    @auth('ansible.playbook.view|ansible.playbook.run')
    def get(self, request):
        playbooks = Playbook.objects.all()
        return json_response([x.to_view() for x in playbooks])

    @auth('ansible.playbook.add|ansible.playbook.edit')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
            Argument('name', help='请输入 Playbook 名称'),
            Argument('content', help='请输入 Playbook 内容'),
            Argument('desc', required=False),
            Argument('extra_vars', type=dict, handler=json.dumps, default={}),
            Argument('group_id', type=int, required=False),
            Argument('tags', required=False),
            Argument('forks', type=int, default=0),
            Argument('timeout', type=int, default=0),
        ).parse(request.body)
        if error is None:
            is_valid, sec_error = validate_playbook_content(form.content)
            if not is_valid:
                return json_response(error=sec_error)
            allowed_roles = {r.name for r in Role.objects.filter(is_active=True)}
            role_ok, role_error, _ = sanitize_playbook_roles(form.content, allowed_roles)
            if not role_ok:
                return json_response(error=role_error)
            extra_vars_dict = json.loads(form.extra_vars) if form.extra_vars else {}
            filtered = filter_extra_vars(extra_vars_dict)
            form.extra_vars = json.dumps(filtered)
            if form.id:
                with transaction.atomic():
                    pb = Playbook.objects.filter(pk=form.id).first()
                    if pb and pb.content != form.content:
                        latest_ver = PlaybookVersion.objects.filter(playbook_id=form.id).order_by('-version').first()
                        next_ver = (latest_ver.version + 1) if latest_ver else 1
                        PlaybookVersion.objects.create(
                            playbook_id=form.id,
                            version=next_ver,
                            content=pb.content,
                            extra_vars=pb.extra_vars,
                            created_by=pb.updated_by or pb.created_by,
                        )
                    form.updated_at = human_datetime()
                    form.updated_by = request.user
                    Playbook.objects.filter(pk=form.pop('id')).update(**form)
            else:
                form.created_by = request.user
                Playbook.objects.create(**form)
        return json_response(error=error)

    @auth('ansible.playbook.edit')
    def patch(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象'),
            Argument('is_active', type=bool, required=False)
        ).parse(request.body, True)
        if error is None:
            Playbook.objects.filter(pk=form.id).update(**form)
        return json_response(error=error)

    @auth('ansible.playbook.del')
    def delete(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象')
        ).parse(request.GET)
        if error is None:
            Playbook.objects.filter(pk=form.id).delete()
        return json_response(error=error)


class PlaybookValidateView(View):
    @auth('ansible.playbook.view|ansible.playbook.add|ansible.playbook.edit')
    def post(self, request):
        form, error = JsonParser(
            Argument('content', help='请输入 Playbook 内容')
        ).parse(request.body)
        if error is None:
            is_valid, sec_error = validate_playbook_content(form.content)
            if not is_valid:
                return json_response(error=sec_error)
            allowed_roles = {r.name for r in Role.objects.filter(is_active=True)}
            role_ok, role_error, used_roles = sanitize_playbook_roles(form.content, allowed_roles)
            if not role_ok:
                return json_response(error=role_error)
            parsed = yaml.safe_load(form.content)
            return json_response({'valid': True, 'plays': len(parsed), 'roles': list(used_roles)})
        return json_response(error=error)


class PlaybookRunView(View):
    @auth('ansible.playbook.run')
    def post(self, request):
        form, error = JsonParser(
            Argument('playbook_id', type=int, help='请指定 Playbook'),
            Argument('host_ids', type=list, filter=lambda x: len(x), help='请选择目标主机'),
            Argument('extra_vars', type=dict, handler=json.dumps, default={}),
            Argument('run_tags', required=False),
            Argument('skip_tags', required=False),
            Argument('check_mode', type=bool, default=False),
        ).parse(request.body)
        if error is None:
            if not has_host_perm(request.user, form.host_ids):
                return json_response(error='无权访问主机，请联系管理员')
            playbook = Playbook.objects.filter(pk=form.playbook_id, is_active=True).first()
            if not playbook:
                return json_response(error='Playbook 不存在或已停用')
            extra_vars_dict = json.loads(form.extra_vars) if form.extra_vars else {}
            filtered = filter_extra_vars(extra_vars_dict)
            form.extra_vars = json.dumps(filtered)
            token = uuid.uuid4().hex
            form.host_ids.sort()
            run = PlaybookRun.objects.create(
                playbook=playbook,
                user=request.user,
                token=token,
                host_ids=json.dumps(form.host_ids),
                extra_vars=form.extra_vars,
                run_tags=form.run_tags,
                skip_tags=form.skip_tags,
                check_mode=form.check_mode,
            )
            rds = get_redis_connection()
            payload = json.dumps({
                'run_id': run.id,
                'token': token,
                'playbook_id': playbook.id,
                'host_ids': form.host_ids,
                'extra_vars': filtered,
                'run_tags': form.run_tags,
                'skip_tags': form.skip_tags,
                'check_mode': form.check_mode,
            })
            transaction.on_commit(lambda: rds.rpush(settings.PLAYBOOK_WORKER_KEY, payload))
            return json_response(token)
        return json_response(error=error)

    @auth('ansible.playbook.run')
    def get(self, request):
        form, error = JsonParser(
            Argument('token', help='参数错误')
        ).parse(request.GET)
        if error is None:
            query = PlaybookRun.objects.filter(token=form.token)
            if not request.user.is_supper:
                query = query.filter(user=request.user)
            run = query.first()
            if not run:
                return json_response(error='执行记录不存在')
            return json_response(run.to_view())
        return json_response(error=error)


class PlaybookHistoryView(View):
    @auth('ansible.playbook.view|ansible.playbook.run')
    def get(self, request):
        form, error = JsonParser(
            Argument('playbook_id', type=int, required=False),
            Argument('page', type=int, default=1),
            Argument('size', type=int, default=20),
        ).parse(request.GET)
        if error is None:
            query = PlaybookRun.objects.select_related('playbook', 'user')
            if not request.user.is_supper:
                query = query.filter(user=request.user)
            if form.playbook_id:
                query = query.filter(playbook_id=form.playbook_id)
            total = query.count()
            offset = (form.page - 1) * form.size
            records = query.order_by('-id')[offset:offset + form.size]
            return json_response({
                'total': total,
                'data': [x.to_view() for x in records],
            })
        return json_response(error=error)


class PlaybookStatsView(View):
    @auth('ansible.playbook.view|ansible.playbook.run')
    def get(self, request):
        form, error = JsonParser(
            Argument('token', help='参数错误')
        ).parse(request.GET)
        if error is None:
            query = PlaybookRun.objects.filter(token=form.token)
            if not request.user.is_supper:
                query = query.filter(user=request.user)
            run = query.first()
            if not run:
                return json_response(error='执行记录不存在')
            stats = json.loads(run.stats) if run.stats else {}
            host_ids = json.loads(run.host_ids) if run.host_ids else []
            hosts = {h.id: {'name': h.name, 'hostname': h.hostname} for h in Host.objects.filter(id__in=host_ids)}
            for host_id in hosts:
                hosts[host_id]['stats'] = stats.get(str(host_id), {})
            return json_response({
                'status': run.status,
                'duration': run.duration,
                'hosts': hosts,
            })
        return json_response(error=error)


class PlaybookVersionView(View):
    @auth('ansible.playbook.view|ansible.playbook.run')
    def get(self, request):
        form, error = JsonParser(
            Argument('playbook_id', type=int, help='请指定 Playbook'),
        ).parse(request.GET)
        if error:
            return json_response(error=error)
        versions = PlaybookVersion.objects.select_related('created_by').filter(playbook_id=form.playbook_id).order_by('-version')
        return json_response([v.to_view() for v in versions])


class PlaybookVersionDetailView(View):
    @auth('ansible.playbook.view|ansible.playbook.run')
    def get(self, request, version_id):
        version = PlaybookVersion.objects.filter(pk=version_id).first()
        if not version:
            return json_response(error='版本不存在')
        return json_response({
            'id': version.id,
            'version': version.version,
            'content': version.content,
            'extra_vars': json.loads(version.extra_vars) if version.extra_vars else {},
            'change_desc': version.change_desc,
            'created_at': version.created_at,
            'created_by_name': version.created_by.username if version.created_by else None,
        })


class PlaybookRollbackView(View):
    @auth('ansible.playbook.edit')
    def post(self, request):
        form, error = JsonParser(
            Argument('playbook_id', type=int, help='请指定 Playbook'),
            Argument('version_id', type=int, help='请指定回滚版本'),
        ).parse(request.body)
        if error:
            return json_response(error=error)
        version = PlaybookVersion.objects.filter(pk=form.version_id, playbook_id=form.playbook_id).first()
        if not version:
            return json_response(error='版本不存在')
        pb = Playbook.objects.filter(pk=form.playbook_id).first()
        if not pb:
            return json_response(error='Playbook 不存在')
        with transaction.atomic():
            latest_ver = PlaybookVersion.objects.filter(playbook_id=form.playbook_id).order_by('-version').first()
            next_ver = (latest_ver.version + 1) if latest_ver else 1
            PlaybookVersion.objects.create(
                playbook_id=form.playbook_id,
                version=next_ver,
                content=pb.content,
                extra_vars=pb.extra_vars,
                change_desc=f'回滚至版本 {version.version}',
                created_by=request.user,
            )
            Playbook.objects.filter(pk=form.playbook_id).update(
                content=version.content,
                extra_vars=version.extra_vars,
                updated_at=human_datetime(),
                updated_by=request.user,
            )
        return json_response(data={'message': f'已回滚至版本 {version.version}'})


class PlaybookDiffView(View):
    @auth('ansible.playbook.view|ansible.playbook.run')
    def get(self, request):
        form, error = JsonParser(
            Argument('playbook_id', type=int, help='请指定 Playbook'),
            Argument('version_id', type=int, required=False),
        ).parse(request.GET)
        if error:
            return json_response(error=error)
        pb = Playbook.objects.filter(pk=form.playbook_id).first()
        if not pb:
            return json_response(error='Playbook 不存在')
        current_content = pb.content.splitlines(keepends=True)
        if form.version_id:
            version = PlaybookVersion.objects.filter(pk=form.version_id).first()
            if not version:
                return json_response(error='版本不存在')
            old_content = version.content.splitlines(keepends=True)
            old_label = f'版本 {version.version} ({version.created_at})'
        else:
            latest = PlaybookVersion.objects.filter(playbook_id=form.playbook_id).order_by('-version').first()
            if not latest:
                return json_response(error='暂无历史版本')
            old_content = latest.content.splitlines(keepends=True)
            old_label = f'版本 {latest.version} ({latest.created_at})'
        diff = list(difflib.unified_diff(old_content, current_content, fromfile=old_label, tofile='当前版本', lineterm=''))
        return json_response({'diff': '\n'.join(diff)})