from django.views.generic import View
from libs import json_response, JsonParser, Argument, auth, human_datetime
from apps.monitor.models import Dashboard, DashboardPanel
import requests
import json
import logging

logger = logging.getLogger(__name__)


class DashboardView(View):
    @auth('monitor.monitor.view')
    def get(self, request):
        dashboards = Dashboard.objects.all()
        return json_response([{
            'id': d.id,
            'name': d.name,
            'desc': d.desc,
            'refresh': d.refresh,
            'datasource_url': d.datasource_url,
            'is_active': d.is_active,
            'panel_count': d.panels.count(),
            'created_at': d.created_at,
            'created_by': d.created_by.username if d.created_by else None,
        } for d in dashboards])

    @auth('monitor.monitor.view')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
            Argument('name', help='请输入大盘名称'),
            Argument('desc', required=False),
            Argument('refresh', type=int, default=30),
            Argument('datasource_url', help='请输入数据源地址'),
            Argument('is_active', type=bool, default=True),
            Argument('panels', type=list, default=[]),
        ).parse(request.body)
        if error:
            return json_response(error=error)

        if form.id:
            dashboard = Dashboard.objects.filter(pk=form.id).first()
            if not dashboard:
                return json_response(error='大盘不存在')
            Dashboard.objects.filter(pk=form.id).update(
                name=form.name, desc=form.desc, refresh=form.refresh,
                datasource_url=form.datasource_url, is_active=form.is_active,
                updated_at=human_datetime(),
            )
            DashboardPanel.objects.filter(dashboard_id=form.id).delete()
            _save_panels(form.id, form.panels)
        else:
            dashboard = Dashboard.objects.create(
                name=form.name, desc=form.desc, refresh=form.refresh,
                datasource_url=form.datasource_url, is_active=form.is_active,
                created_by=request.user,
            )
            _save_panels(dashboard.id, form.panels)
        return json_response(dashboard.to_view())


class DashboardDetailView(View):
    @auth('monitor.monitor.view')
    def get(self, request, pk):
        dashboard = Dashboard.objects.filter(pk=pk).first()
        if not dashboard:
            return json_response(error='大盘不存在')
        return json_response(dashboard.to_view())

    @auth('monitor.monitor.view')
    def delete(self, request, pk):
        Dashboard.objects.filter(pk=pk).delete()
        return json_response(data={'message': '删除成功'})


class DashboardQueryView(View):
    @auth('monitor.monitor.view')
    def post(self, request):
        form, error = JsonParser(
            Argument('datasource_url', help='请指定数据源'),
            Argument('query', help='请输入查询表达式'),
            Argument('start', required=False),
            Argument('end', required=False),
            Argument('step', type=int, default=15),
        ).parse(request.body)
        if error:
            return json_response(error=error)

        try:
            if form.start and form.end:
                url = f"{form.datasource_url.rstrip('/')}/api/v1/query_range"
                params = {
                    'query': form.query,
                    'start': form.start,
                    'end': form.end,
                    'step': f'{form.step}s',
                }
            else:
                url = f"{form.datasource_url.rstrip('/')}/api/v1/query"
                params = {'query': form.query}

            res = requests.get(url, params=params, timeout=15)
            return json_response(res.json())
        except requests.exceptions.ConnectionError:
            return json_response(error='无法连接数据源，请检查地址是否正确')
        except Exception as e:
            logger.error(f'Dashboard query failed: {e}', exc_info=True)
            return json_response(error=f'查询失败: {e}')


def _save_panels(dashboard_id, panels):
    for i, p in enumerate(panels):
        DashboardPanel.objects.create(
            dashboard_id=dashboard_id,
            title=p.get('title', '未命名'),
            panel_type=p.get('panel_type', 'timeseries'),
            query=p.get('query', ''),
            unit=p.get('unit'),
            sort_order=i,
            col_span=p.get('col_span', 12),
            height=p.get('height', 300),
            config=json.dumps(p.get('config', {})),
        )