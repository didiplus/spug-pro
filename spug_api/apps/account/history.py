# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.views.generic import View
from libs import json_response, auth
from apps.account.models import History, OperationLog


class HistoryView(View):
    @auth('system.login.view')
    def get(self, request):
        histories = History.objects.all()
        return json_response(histories)


class OperotionLogView(View):
    @auth('system.log.view')
    def get(self, request):
        page = int(request.GET.get('page', 1))
        page_size = min(int(request.GET.get('page_size', 10)), 100)
        username = request.GET.get('username', '').strip()
        module = request.GET.get('module', '').strip()
        status = request.GET.get('status', '').strip()
        start_time = request.GET.get('start_time', '').strip()
        end_time = request.GET.get('end_time', '').strip()

        queryset = OperationLog.objects.all()

        if username:
            queryset = queryset.filter(username__icontains=username)
        if module:
            queryset = queryset.filter(module__icontains=module)
        if status:
            queryset = queryset.filter(status=status)
        if start_time:
            queryset = queryset.filter(create_time__gte=start_time)
        if end_time:
            queryset = queryset.filter(create_time__lte=end_time)

        total = queryset.count()
        offset = (page - 1) * page_size
        rows = queryset[offset:offset + page_size]

        data = [item.to_dict() for item in rows]
        return json_response({'total': total, 'page': page, 'page_size': page_size, 'results': data})
