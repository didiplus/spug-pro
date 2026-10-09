from django.views.generic import View
from django.db import transaction
from django_redis import get_redis_connection
from django.conf import settings
from django.http import HttpResponseBadRequest
from libs import json_response, JsonParser, Argument, human_datetime, human_time, auth
from apps.pipeline.models import Pipeline, PipelineHistory
from apps.pipeline.services.engine import start_pipeline_run
from apps.host.models import Host
import json
import os
import time


class PipelineView(View):
    @auth('pipeline.pipeline.view|pipeline.pipeline.do')
    def get(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
        ).parse(request.GET, True)
        if error is None:
            if form.get('id'):
                try:
                    pipeline = Pipeline.objects.get(pk=form.get('id'))
                    return json_response(pipeline.to_view())
                except Pipeline.DoesNotExist:
                    return json_response(error='流水线不存在')
            pipelines = Pipeline.objects.all().order_by('-id')
            return json_response([x.to_view() for x in pipelines])
        return json_response(error=error)

    @auth('pipeline.pipeline.add|pipeline.pipeline.edit')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
            Argument('name', help='请输入流水线名称'),
            Argument('desc', required=False),
            Argument('group_id', type=int, default=1),
            Argument('nodes', type=list, handler=json.dumps, default=[]),
            Argument('is_active', type=bool, default=True),
        ).parse(request.body)
        if error is None:
            if form.get('id'):
                pk = form.pop('id')
                form.updated_at = human_datetime()
                form.updated_by = request.user
                Pipeline.objects.filter(pk=pk).update(**form)
                pipeline = Pipeline.objects.get(pk=pk)
                return json_response(pipeline.to_view())
            else:
                form.created_by = request.user
                pipeline = Pipeline.objects.create(**form)
                return json_response(pipeline.to_view())
        return json_response(error=error)

    @auth('pipeline.pipeline.del')
    def delete(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象')
        ).parse(request.GET)
        if error is None:
            Pipeline.objects.filter(pk=form.id).delete()
        return json_response(error=error)


class PipelineDoView(View):
    @auth('pipeline.pipeline.do')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定流水线'),
        ).parse(request.body)
        if error is None:
            try:
                pipeline = Pipeline.objects.get(pk=form.id)
            except Pipeline.DoesNotExist:
                return json_response(error='流水线不存在')
            if not pipeline.is_active:
                return json_response(error='流水线已禁用')

            with transaction.atomic():
                history = start_pipeline_run(pipeline, request.user, trigger_type='manual')
                rds = get_redis_connection()
                payload = json.dumps({'history_id': history.id})
                transaction.on_commit(lambda: rds.rpush(settings.PIPELINE_WORKER_KEY, payload))

            nodes = json.loads(history.nodes)
            outputs = {}
            for node in nodes:
                outputs[str(node['id'])] = {'id': str(node['id']), 'name': node.get('name', ''), 'data': f'{human_time()} 等待调度...        '}
            return json_response({
                'token': history.token,
                'nodes': nodes,
                'outputs': outputs,
            })
        return json_response(error=error)


class PipelineHistoryView(View):
    @auth('pipeline.pipeline.view|pipeline.pipeline.do')
    def get(self, request):
        form, error = JsonParser(
            Argument('pipeline_id', type=int, help='请指定流水线'),
        ).parse(request.GET, True)
        if error is None:
            histories = PipelineHistory.objects.filter(pipeline_id=form.pipeline_id).order_by('-id')[:50]
            return json_response([x.to_view() for x in histories])
        return json_response(error=error)


class PipelineHistoryDetailView(View):
    @auth('pipeline.pipeline.view|pipeline.pipeline.do')
    def get(self, request, h_id):
        try:
            history = PipelineHistory.objects.select_related('pipeline').get(pk=h_id)
        except PipelineHistory.DoesNotExist:
            return json_response(error='执行记录不存在')

        nodes = json.loads(history.nodes)
        rds = get_redis_connection()
        key = history.deploy_key
        counter = 0
        outputs = {}
        for node in nodes:
            outputs[str(node['id'])] = {'id': str(node['id']), 'name': node.get('name', ''), 'data': f'{human_time()} 读取数据...        '}

        data = rds.lrange(key, counter, counter + 9)
        while data:
            for item in data:
                counter += 1
                item = json.loads(item.decode())
                k = item['key']
                if k in outputs:
                    if 'data' in item:
                        outputs[k]['data'] += item['data']
                    if 'status' in item:
                        outputs[k]['status'] = item['status']
            data = rds.lrange(key, counter, counter + 9)

        return json_response({
            'token': history.token,
            'nodes': nodes,
            'outputs': outputs,
            'index': counter,
            'status': history.status,
            'log_channel': history.pub_channel,
        })

class PipelineUploadView(View):
    @auth('pipeline.pipeline.edit')
    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return HttpResponseBadRequest('未收到文件')
        upload_dir = settings.PIPELINE_UPLOAD_DIR
        os.makedirs(upload_dir, exist_ok=True)
        timestamp = time.strftime('%Y%m%d%H%M%S')
        safe_name = os.path.basename(file.name)
        stored_name = f'{timestamp}_{safe_name}'
        stored_path = os.path.join(upload_dir, stored_name)
        with open(stored_path, 'wb') as f:
            for chunk in file.chunks():
                f.write(chunk)
        return json_response({'path': stored_path, 'name': safe_name, 'size': file.size})

    @auth('pipeline.pipeline.edit')
    def delete(self, request):
        form, error = JsonParser(
            Argument('path', help='请指定要删除的文件路径')
        ).parse(request.GET)
        if error is None:
            upload_dir = os.path.abspath(settings.PIPELINE_UPLOAD_DIR)
            target = os.path.abspath(form.path)
            if not target.startswith(upload_dir + os.sep):
                return json_response(error='只允许删除上传目录中的文件')
            if os.path.isfile(target):
                os.remove(target)
            return json_response()
        return json_response(error=error)
