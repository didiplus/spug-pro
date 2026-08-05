# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.views.generic import View
from django.http import HttpResponse
from django_redis import get_redis_connection
from django.conf import settings
from libs import json_response, JsonParser, Argument, human_datetime, auth
from apps.exec.models import ExecTemplate, InspectTask, InspectResult
from apps.host.models import Host
from apps.account.utils import has_host_perm
import uuid
import json
import datetime


class InspectTaskView(View):
    @auth('exec.inspect.view')
    def get(self, request):
        tasks = InspectTask.objects.all()
        return json_response([x.to_view() for x in tasks])

    @auth('exec.inspect.add|exec.inspect.edit')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
            Argument('name', help='请输入任务名称'),
            Argument('template_id', type=int, help='请选择巡检模板'),
            Argument('interpreter', default='sh'),
            Argument('command', help='请输入巡检命令'),
            Argument('rule', type=dict, handler=json.dumps, default={'type': 'exit_code', 'exit_codes': [0]}),
            Argument('host_ids', type=list, handler=json.dumps, default=[]),
            Argument('notify_grp', type=list, handler=json.dumps, default=[]),
            Argument('notify_mode', type=list, handler=json.dumps, default=[]),
            Argument('desc', required=False)
        ).parse(request.body)
        if error is None:
            if form.id:
                form.updated_at = human_datetime()
                form.updated_by = request.user
                InspectTask.objects.filter(pk=form.pop('id')).update(**form)
            else:
                form.created_by = request.user
                InspectTask.objects.create(**form)
        return json_response(error=error)

    @auth('exec.inspect.del')
    def delete(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象')
        ).parse(request.GET)
        if error is None:
            InspectTask.objects.filter(pk=form.id).delete()
        return json_response(error=error)


class InspectRunView(View):
    @auth('exec.inspect.do')
    def post(self, request):
        form, error = JsonParser(
            Argument('task_id', type=int, help='请指定巡检任务')
        ).parse(request.body)
        if error is None:
            task = InspectTask.objects.filter(pk=form.task_id).first()
            if not task:
                return json_response(error='巡检任务不存在')
            host_ids = json.loads(task.host_ids)
            if not has_host_perm(request.user, host_ids):
                return json_response(error='无权访问主机，请联系管理员')
            token = uuid.uuid4().hex
            rds = get_redis_connection()
            host_ids.sort()
            for host in Host.objects.filter(id__in=host_ids):
                InspectResult.objects.create(
                    task_id=task.id,
                    host_id=host.id,
                    status='running',
                    run_at=human_datetime()
                )
                data = dict(
                    key=host.id,
                    name=host.name,
                    token=token,
                    interpreter=task.interpreter,
                    hostname=host.hostname,
                    port=host.port,
                    username=host.username,
                    command=task.command,
                    pkey=host.private_key,
                    term=None,
                    inspect_task_id=task.id
                )
                rds.rpush(settings.EXEC_WORKER_KEY, json.dumps(data))
            return json_response(token)
        return json_response(error=error)


class InspectResultView(View):
    @auth('exec.inspect.view')
    def get(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
            Argument('task_id', type=int, required=False),
            Argument('run_at', required=False)
        ).parse(request.GET)
        if error is None:
            records = InspectResult.objects.all()
            if form.id:
                records = records.filter(pk=form.id)
            if form.task_id:
                records = records.filter(task_id=form.task_id)
            if form.run_at:
                records = records.filter(run_at=form.run_at)
            return json_response([x.to_view() for x in records])
        return json_response(error=error)


class InspectReportView(View):
    @auth('exec.inspect.view')
    def get(self, request):
        form, error = JsonParser(
            Argument('task_id', type=int, help='请指定巡检任务'),
            Argument('run_at', required=False)
        ).parse(request.GET)
        if error is not None:
            return json_response(error=error)

        task = InspectTask.objects.filter(pk=form.task_id).first()
        if not task:
            return json_response(error='巡检任务不存在')

        results = InspectResult.objects.filter(task_id=form.task_id)
        if form.run_at:
            results = results.filter(run_at=form.run_at)

        tpl = ExecTemplate.objects.filter(pk=task.template_id).first()
        rule = json.loads(task.rule) if task.rule else {}
        now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        total = results.count()
        success = results.filter(status='success').count()
        warning = results.filter(status='warning').count()
        error_count = results.filter(status='error').count()
        pending = results.filter(status__in=['pending', 'running']).count()

        status_label = '正常' if warning == 0 and error_count == 0 else '异常'
        status_color = '#52c41a' if status_label == '正常' else '#ff4d4f'

        rows_html = ''
        for idx, r in enumerate(results, 1):
            host = Host.objects.filter(pk=r.host_id).first()
            host_name = host.name if host else str(r.host_id)
            host_hostname = host.hostname if host else ''
            s_map = {'success': ('正常', '#52c41a'), 'warning': ('告警', '#faad14'),
                     'error': ('失败', '#ff4d4f'), 'pending': ('待执行', '#8c8c8c'),
                     'running': ('执行中', '#1677ff')}
            s_text, s_color = s_map.get(r.status, ('未知', '#8c8c8c'))
            output_escaped = (r.output or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('\n', '<br/>')
            rows_html += f'''
            <tr>
                <td>{idx}</td>
                <td>{host_name}<br/><small style="color:#8c8c8c">{host_hostname}</small></td>
                <td><span style="color:{s_color};font-weight:600">● {s_text}</span></td>
                <td>{r.exit_code if r.exit_code is not None else '-'}</td>
                <td>{r.duration}s</td>
                <td>{r.run_at}</td>
            </tr>'''
            if output_escaped:
                rows_html += f'''
            <tr class="output-row">
                <td colspan="6"><details><summary style="cursor:pointer;color:#1677ff">查看输出</summary><pre style="background:#f6f8fa;padding:12px;border-radius:4px;margin-top:8px;white-space:pre-wrap;font-size:12px">{output_escaped}</pre></details></td>
            </tr>'''

        html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>巡检报告 - {task.name}</title>
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; color:#262626; background:#f5f5f5; padding:24px; }}
.container {{ max-width:960px; margin:0 auto; background:#fff; border-radius:12px; box-shadow:0 2px 12px rgba(0,0,0,0.08); overflow:hidden; }}
.header {{ background:linear-gradient(135deg,#1677ff 0%,#0958d9 100%); color:#fff; padding:32px 40px; }}
.header h1 {{ font-size:24px; margin-bottom:8px; }}
.header .meta {{ font-size:13px; opacity:0.85; }}
.summary {{ display:flex; padding:24px 40px; border-bottom:1px solid #f0f0f0; }}
.summary .item {{ flex:1; text-align:center; }}
.summary .item .num {{ font-size:32px; font-weight:700; }}
.summary .item .label {{ font-size:13px; color:#8c8c8c; margin-top:4px; }}
.info {{ padding:20px 40px; border-bottom:1px solid #f0f0f0; }}
.info .row {{ display:flex; padding:6px 0; font-size:14px; }}
.info .row .k {{ color:#8c8c8c; width:100px; flex-shrink:0; }}
.info .row .v {{ flex:1; }}
.content {{ padding:24px 40px; }}
table {{ width:100%; border-collapse:collapse; font-size:14px; }}
th {{ background:#fafafa; padding:12px 16px; text-align:left; font-weight:600; border-bottom:2px solid #f0f0f0; }}
td {{ padding:10px 16px; border-bottom:1px solid #f0f0f0; }}
.output-row td {{ padding:4px 16px 10px; border-bottom:1px solid #f0f0f0; }}
.footer {{ padding:16px 40px; text-align:center; color:#8c8c8c; font-size:12px; border-top:1px solid #f0f0f0; }}
.badge {{ display:inline-block; padding:2px 12px; border-radius:4px; font-size:13px; font-weight:600; }}
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>巡检报告</h1>
        <div class="meta">{task.name} | 生成时间：{now}</div>
    </div>
    <div class="summary">
        <div class="item"><div class="num" style="color:#1677ff">{total}</div><div class="label">全部</div></div>
        <div class="item"><div class="num" style="color:#52c41a">{success}</div><div class="label">正常</div></div>
        <div class="item"><div class="num" style="color:#faad14">{warning}</div><div class="label">告警</div></div>
        <div class="item"><div class="num" style="color:#ff4d4f">{error_count}</div><div class="label">失败</div></div>
        <div class="item"><div class="num" style="color:#8c8c8c">{pending}</div><div class="label">待执行</div></div>
    </div>
    <div class="info">
        <div class="row"><div class="k">巡检状态</div><div class="v"><span class="badge" style="background:{'#f6ffed' if status_label=='正常' else '#fff2f0'};color:{status_color}">{status_label}</span></div></div>
        <div class="row"><div class="k">巡检模板</div><div class="v">{tpl.name if tpl else '-'}</div></div>
        <div class="row"><div class="k">判定规则</div><div class="v">{{'退出码: ' + str(rule.get('exit_codes', [])) if rule.get('type') == 'exit_code' else '关键字: ' + str(rule.get('keywords', []))}}</div></div>
        <div class="row"><div class="k">目标主机</div><div class="v">{total} 台</div></div>
        <div class="row"><div class="k">任务描述</div><div class="v">{task.desc or '-'}</div></div>
    </div>
    <div class="content">
        <table>
            <thead><tr><th>#</th><th>主机</th><th>状态</th><th>退出码</th><th>耗时</th><th>执行时间</th></tr></thead>
            <tbody>{rows_html}</tbody>
        </table>
    </div>
    <div class="footer">Spug 运维平台 · 巡检报告 · {now}</div>
</div>
</body>
</html>'''

        filename = f"inspect_report_{task.name}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
        response = HttpResponse(html, content_type='text/html; charset=utf-8')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response
