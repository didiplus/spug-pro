from django.views.generic import View
from django.http import FileResponse, Http404
from libs import json_response, JsonParser, Argument, auth
from apps.host.models import SSHSession
import os


class SSHSessionView(View):
    @auth('host.console.view')
    def get(self, request):
        form, error = JsonParser(
            Argument('page', type=int, default=1),
            Argument('size', type=int, default=20),
            Argument('host_name', required=False),
            Argument('user_name', required=False),
            Argument('status', required=False),
        ).parse(request.GET)
        if error:
            return json_response(error=error)

        query = SSHSession.objects.all()
        if form.host_name:
            query = query.filter(host_name__icontains=form.host_name)
        if form.status:
            query = query.filter(status=form.status)

        total = query.count()
        offset = (form.page - 1) * form.size
        records = query.order_by('-id')[offset:offset + form.size]
        return json_response({
            'total': total,
            'data': [r.to_view() for r in records],
        })

    @auth('host.console.view')
    def delete(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定要删除的会话'),
        ).parse(request.GET)
        if error:
            return json_response(error=error)
        session = SSHSession.objects.filter(pk=form.id).first()
        if not session:
            return json_response(error='会话不存在')
        if session.file_path and os.path.exists(session.file_path):
            try:
                os.remove(session.file_path)
            except Exception:
                pass
        session.delete()
        return json_response(data={'message': '删除成功'})


class SSHSessionDetailView(View):
    @auth('host.console.view')
    def get(self, request, token):
        session = SSHSession.objects.filter(token=token).first()
        if not session:
            return json_response(error='会话不存在')
        return json_response(session.to_view())


class SSHRecordingView(View):
    @auth('host.console.view')
    def get(self, request, token):
        session = SSHSession.objects.filter(token=token).first()
        if not session:
            return json_response(error='会话不存在')
        if not session.file_path or not os.path.exists(session.file_path):
            return json_response(error='录制文件不存在')
        response = FileResponse(open(session.file_path, 'rb'), content_type='application/json')
        response['Content-Disposition'] = f'inline; filename="{token}.cast"'
        return response