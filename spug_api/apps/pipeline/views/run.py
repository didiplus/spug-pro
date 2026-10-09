from django.views.generic import View
from django.db import transaction
from django_redis import get_redis_connection
from django.conf import settings
from libs import json_response, JsonParser, Argument, human_datetime, human_time, auth
from apps.pipeline.models import Pipeline, PipelineRun
from apps.pipeline.services.engine import start_pipeline_run
from apps.host.models import Host
import json


class PipelineRunView(View):
    @auth('pipeline.pipeline.view|pipeline.pipeline.run')
    def get(self, request):
        form, error = JsonParser(
            Argument('pipeline_id', type=int, required=False),
            Argument('status', required=False),
            Argument('page', type=int, default=1),
            Argument('page_size', type=int, default=20),
        ).parse(request.GET, True)
        if error is None:
            query = PipelineRun.objects.select_related('pipeline', 'trigger_user')
            if form.pipeline_id:
                query = query.filter(pipeline_id=form.pipeline_id)
            if form.status:
                query = query.filter(status=form.status)
            total = query.count()
            offset = (form.page - 1) * form.page_size
            runs = query.order_by('-id')[offset:offset + form.page_size]
            return json_response({
                'data': [x.to_view() for x in runs],
                'total': total,
                'page': form.page,
                'page_size': form.page_size,
            })
        return json_response(error=error)

    @auth('pipeline.pipeline.run')
    def post(self, request):
        form, error = JsonParser(
            Argument('pipeline_id', type=int, help='请指定流水线'),
            Argument('host_ids', type=list, required=False),
        ).parse(request.body)
        if error is None:
            try:
                pipeline = Pipeline.objects.get(pk=form.pipeline_id)
            except Pipeline.DoesNotExist:
                return json_response(error='流水线不存在')
            if not pipeline.is_active:
                return json_response(error='流水线已禁用')

            host_ids = form.host_ids if form.host_ids else json.loads(pipeline.host_ids)
            if not host_ids:
                return json_response(error='未选择目标主机')

            with transaction.atomic():
                run = start_pipeline_run(pipeline, request.user, trigger_type='manual')
                if form.host_ids:
                    run.host_ids = json.dumps(form.host_ids)
                    run.save(update_fields=['host_ids'])
                rds = get_redis_connection()
                payload = json.dumps({'run_id': run.id})
                transaction.on_commit(lambda: rds.rpush(settings.PIPELINE_WORKER_KEY, payload))

            hosts = Host.objects.filter(id__in=host_ids)
            server_actions = json.loads(run.server_actions_snapshot)
            host_actions = json.loads(run.host_actions_snapshot)
            outputs = {x.id: {'id': x.id, 'title': x.name, 'step': 0, 'data': f'{human_time()} 等待调度...        '} for x in hosts}
            if server_actions:
                outputs['local'] = {'id': 'local', 'title': '本地执行', 'step': 0, 'data': f'{human_time()} 等待调度...        '}
            if not host_actions:
                outputs = {'local': outputs.get('local', {'id': 'local', 'title': '本地执行', 'step': 0, 'data': ''})}
            return json_response({
                'token': run.token,
                'run_id': run.id,
                'log_channel': run.pub_channel,
                's_actions': server_actions,
                'h_actions': host_actions,
                'outputs': outputs,
            })
        return json_response(error=error)


class PipelineRunDetailView(View):
    @auth('pipeline.pipeline.view|pipeline.pipeline.run')
    def get(self, request, pk):
        try:
            run = PipelineRun.objects.select_related('pipeline', 'trigger_user').get(pk=pk)
        except PipelineRun.DoesNotExist:
            return json_response(error='执行记录不存在')

        host_ids = json.loads(run.host_ids)
        server_actions = json.loads(run.server_actions_snapshot)
        host_actions = json.loads(run.host_actions_snapshot)
        hosts = Host.objects.filter(id__in=host_ids)
        outputs = {x.id: {'id': x.id, 'title': x.name, 'data': f'{human_time()} 读取数据...        '} for x in hosts}
        if server_actions:
            outputs['local'] = {'id': 'local', 'title': '本地执行', 'data': f'{human_time()} 读取数据...        '}

        rds = get_redis_connection()
        key = run.deploy_key
        counter = 0
        data = rds.lrange(key, counter, counter + 9)
        while data:
            for item in data:
                counter += 1
                item = json.loads(item.decode())
                if item['key'] in outputs:
                    if 'data' in item:
                        outputs[item['key']]['data'] += item['data']
                    if 'status' in item:
                        outputs[item['key']]['status'] = item['status']
            data = rds.lrange(key, counter, counter + 9)

        response = {
            'run': run.to_view(),
            's_actions': server_actions,
            'h_actions': host_actions,
            'outputs': outputs,
            'index': counter,
            'log_key': key,
            'log_channel': run.pub_channel,
        }
        if counter == 0:
            for item in outputs:
                outputs[item]['data'] += '\r\n\r\n未读取到数据，Spug 仅保存最近2周的日志信息。'
        return json_response(response)


class PipelineRunLogView(View):
    @auth('pipeline.pipeline.view|pipeline.pipeline.run')
    def get(self, request, pk):
        form, error = JsonParser(
            Argument('index', type=int, default=0),
        ).parse(request.GET, True)
        if error is None:
            try:
                run = PipelineRun.objects.get(pk=pk)
            except PipelineRun.DoesNotExist:
                return json_response(error='执行记录不存在')

            rds = get_redis_connection()
            key = run.deploy_key
            counter = form.index
            data = rds.lrange(key, counter, counter + 49)
            outputs = {}
            while data:
                for item in data:
                    counter += 1
                    item = json.loads(item.decode())
                    if item['key'] not in outputs:
                        outputs[item['key']] = {'id': item['key'], 'data': ''}
                    if 'data' in item:
                        outputs[item['key']]['data'] += item['data']
                    if 'status' in item:
                        outputs[item['key']]['status'] = item['status']
                data = rds.lrange(key, counter, counter + 49)
            return json_response({'outputs': outputs, 'index': counter, 'status': run.status})
        return json_response(error=error)
