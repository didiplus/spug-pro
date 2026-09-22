# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.views.generic import View
from django.db import transaction
from libs import json_response, JsonParser, Argument, auth
from apps.ansible.models import HostFacts
from apps.account.utils import has_host_perm
import json


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
            if not has_host_perm(request.user, form.host_ids):
                return json_response(error='无权访问主机，请联系管理员')
            from django_redis import get_redis_connection
            from django.conf import settings
            import uuid
            token = uuid.uuid4().hex
            rds = get_redis_connection()
            payload = json.dumps({
                'token': token,
                'host_ids': form.host_ids,
            })
            queue_key = getattr(settings, 'FACTS_WORKER_KEY', 'spug:facts:worker')
            transaction.on_commit(lambda: rds.rpush(queue_key, payload))
            return json_response(token)
        return json_response(error=error)