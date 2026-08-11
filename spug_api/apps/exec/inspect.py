from django.views.generic import View
from django.http import HttpResponse
from django.template.loader import render_to_string
from django_redis import get_redis_connection
from django.conf import settings
from libs import json_response, JsonParser, Argument, human_datetime, auth
from apps.exec.models import InspectItem, InspectTask, InspectResult
from apps.host.models import Host
from apps.account.utils import has_host_perm
import uuid
import json
import re
import datetime
import logging

logger = logging.getLogger(__name__)


def judge_inspect(output, exit_code, item):
    if exit_code != 0:
        return 'error', None, None

    matched_text = None
    actual_value = None
    passed = False

    try:
        match = re.search(item.pattern, output or '')
        if match:
            matched_text = match.group(0)
            if match.groups():
                try:
                    actual_value = float(match.group(1))
                except (ValueError, IndexError):
                    pass

        if item.threshold_op != 'none' and actual_value is not None:
            passed = _compare(actual_value, item.threshold_op, item.threshold_val)
        else:
            passed = match is not None

        if item.match_type == 'regex_fail':
            passed = not passed
    except re.error:
        return 'error', None, None

    return 'success' if passed else item.expect_status, matched_text, actual_value


def _compare(actual, op, threshold):
    if threshold is None:
        return False
    if op == 'gt':
        return actual > threshold
    if op == 'lt':
        return actual < threshold
    if op == 'gte':
        return actual >= threshold
    if op == 'lte':
        return actual <= threshold
    if op == 'eq':
        return actual == threshold
    return False


class InspectItemView(View):
    @auth('exec.inspect.view')
    def get(self, request):
        items = InspectItem.objects.all()
        return json_response([x.to_dict() for x in items])

    @auth('exec.inspect.add|exec.inspect.edit')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
            Argument('name', help='请输入巡检项名称'),
            Argument('category', default='custom'),
            Argument('interpreter', default='sh'),
            Argument('command', help='请输入执行命令'),
            Argument('match_type', default='regex_pass'),
            Argument('pattern', default=''),
            Argument('threshold_op', default='none'),
            Argument('threshold_val', type=float, required=False),
            Argument('expect_status', default='warning'),
            Argument('desc', required=False),
            Argument('is_active', type=bool, default=True),
        ).parse(request.body)
        if error is None:
            if form.id:
                form.updated_at = human_datetime()
                form.updated_by = request.user
                InspectItem.objects.filter(pk=form.pop('id')).update(**form)
            else:
                form.created_by = request.user
                InspectItem.objects.create(**form)
        return json_response(error=error)

    @auth('exec.inspect.del')
    def delete(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象')
        ).parse(request.GET)
        if error is None:
            InspectItem.objects.filter(pk=form.id).delete()
        return json_response(error=error)


class InspectItemTestView(View):
    @auth('exec.inspect.view')
    def post(self, request):
        form, error = JsonParser(
            Argument('pattern', default=''),
            Argument('match_type', default='regex_pass'),
            Argument('threshold_op', default='none'),
            Argument('threshold_val', type=float, required=False),
            Argument('expect_status', default='warning'),
            Argument('output', default=''),
        ).parse(request.body)
        if error is not None:
            return json_response(error=error)

        item = type('Item', (), {
            'pattern': form.pattern,
            'match_type': form.match_type,
            'threshold_op': form.threshold_op,
            'threshold_val': form.threshold_val,
            'expect_status': form.expect_status,
        })()
        status, matched, actual = judge_inspect(form.output, 0, item)
        return json_response({
            'status': status,
            'matched': matched,
            'actual_value': actual,
        })


class InspectTaskView(View):
    @auth('exec.inspect.view')
    def get(self, request):
        threshold = (datetime.datetime.now() - datetime.timedelta(minutes=10)).strftime('%Y-%m-%d %H:%M:%S')
        InspectResult.objects.filter(status='running', run_at__lt=threshold).update(
            status='error', output='执行超时（超过10分钟未完成）'
        )
        tasks = InspectTask.objects.all()
        return json_response([x.to_view() for x in tasks])

    @auth('exec.inspect.add|exec.inspect.edit')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
            Argument('name', help='请输入任务名称'),
            Argument('item_ids', type=list, handler=json.dumps, default=[]),
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
            item_ids = json.loads(task.item_ids)
            if not host_ids:
                return json_response(error='未配置目标主机')
            if not item_ids:
                return json_response(error='未关联巡检项')
            if not has_host_perm(request.user, host_ids):
                return json_response(error='无权访问主机，请联系管理员')
            InspectResult.objects.filter(task_id=task.id, status='running').update(status='error', output='执行被中断（新任务启动）')
            token = uuid.uuid4().hex
            batch_id = uuid.uuid4().hex
            rds = get_redis_connection()
            run_at = human_datetime()
            items = list(InspectItem.objects.filter(id__in=item_ids, is_active=True).order_by('id'))
            if not items:
                return json_response(error='无可用巡检项')

            for host in Host.objects.filter(id__in=host_ids):
                for item in items:
                    InspectResult.objects.create(
                        task_id=task.id,
                        batch_id=batch_id,
                        host_id=host.id,
                        item_id=item.id,
                        item_name=item.name,
                        status='running',
                        run_at=run_at,
                    )

                combined_command = build_combined_script(items)
                data = dict(
                    key=host.id,
                    name=host.name,
                    token=token,
                    interpreter='sh',
                    hostname=host.hostname,
                    port=host.port,
                    username=host.username,
                    command=combined_command,
                    pkey=host.private_key,
                    term=None,
                    inspect_task_id=task.id,
                    inspect_batch_id=batch_id,
                    inspect_item_ids=[item.id for item in items],
                )
                rds.rpush(settings.EXEC_WORKER_KEY, json.dumps(data))
            return json_response({'token': token, 'batch_id': batch_id})
        return json_response(error=error)


def build_combined_script(items):
    lines = []
    for item in items:
        marker_start = f'###SPUG_START:{item.id}###'
        marker_exit = f'###SPUG_EXIT:$?:{item.id}###'
        marker_end = f'###SPUG_END:{item.id}###'
        if item.interpreter == 'python':
            cmd = f'python3 << PYEOF\n# -*- coding: UTF-8 -*-\n{item.command}\nPYEOF'
        else:
            cmd = item.command
        lines.append(f'echo "{marker_start}"')
        lines.append(cmd)
        lines.append(f'echo "{marker_exit}"')
        lines.append(f'echo "{marker_end}"')
    return '\n'.join(lines)


def parse_combined_output(output, item_ids):
    results = {}
    for item_id in item_ids:
        start_marker = f'###SPUG_START:{item_id}###'
        end_marker = f'###SPUG_END:{item_id}###'
        exit_prefix = f'###SPUG_EXIT:'

        start_idx = output.find(start_marker)
        end_idx = output.find(end_marker)

        if start_idx == -1 or end_idx == -1:
            results[item_id] = {'output': '', 'exit_code': -1}
            continue

        section = output[start_idx + len(start_marker):end_idx].strip()
        lines = section.split('\n')

        exit_code = -1
        content_lines = []
        for line in lines:
            if line.startswith(exit_prefix):
                try:
                    parts = line.strip().split(':')
                    exit_code = int(parts[1])
                except (ValueError, IndexError):
                    pass
            else:
                content_lines.append(line)

        results[item_id] = {
            'output': '\n'.join(content_lines).strip(),
            'exit_code': exit_code,
        }
    return results


class InspectResultView(View):
    @auth('exec.inspect.view')
    def get(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
            Argument('task_id', type=int, required=False),
            Argument('batch_id', required=False),
        ).parse(request.GET)
        if error is None:
            records = InspectResult.objects.all()
            if form.id:
                records = records.filter(pk=form.id)
            if form.task_id:
                records = records.filter(task_id=form.task_id)
            if form.batch_id:
                records = records.filter(batch_id=form.batch_id)
            return json_response([x.to_view() for x in records])
        return json_response(error=error)


class InspectReportView(View):
    _STATUS_MAP = {
        'success': ('正常', '#52c41a', '#f6ffed', '#b7eb8f'),
        'warning': ('告警', '#faad14', '#fffbe6', '#ffe58f'),
        'error': ('失败', '#ff4d4f', '#fff2f0', '#ffccc7'),
        'pending': ('待执行', '#8c8c8c', '#fafafa', '#d9d9d9'),
        'running': ('执行中', '#1677ff', '#e6f4ff', '#91caff'),
    }

    @auth('exec.inspect.view')
    def get(self, request):
        form, error = JsonParser(
            Argument('task_id', type=int, help='请指定巡检任务'),
            Argument('batch_id', required=False),
        ).parse(request.GET)
        if error is not None:
            return json_response(error=error)

        task = InspectTask.objects.filter(pk=form.task_id).first()
        if not task:
            return json_response(error='巡检任务不存在')

        results = InspectResult.objects.filter(task_id=form.task_id)
        if form.batch_id:
            results = results.filter(batch_id=form.batch_id)
        else:
            latest = results.order_by('-id').first()
            if latest:
                results = results.filter(batch_id=latest.batch_id)

        results = list(results)
        total = len(results)
        success = sum(1 for r in results if r.status == 'success')
        warning = sum(1 for r in results if r.status == 'warning')
        error_count = sum(1 for r in results if r.status == 'error')
        pending = sum(1 for r in results if r.status in ['pending', 'running'])
        pass_rate = round(success / total * 100, 1) if total > 0 else 0
        pass_color = '#52c41a' if pass_rate == 100 else ('#faad14' if pass_rate >= 60 else '#ff4d4f')

        host_map = {}
        for r in results:
            host = Host.objects.filter(pk=r.host_id).first()
            if r.host_id not in host_map:
                host_map[r.host_id] = {
                    'name': host.name if host else str(r.host_id),
                    'hostname': host.hostname if host else '',
                    'items': [],
                }
            host_map[r.host_id]['items'].append(r)

        hosts = []
        for info in host_map.values():
            host_items = info['items']
            h_total = len(host_items)
            h_success = sum(1 for r in host_items if r.status == 'success')
            h_warning = sum(1 for r in host_items if r.status == 'warning')
            h_error = sum(1 for r in host_items if r.status == 'error')
            h_pass_rate = round(h_success / h_total * 100, 1) if h_total > 0 else 0
            h_pass_color = '#52c41a' if h_pass_rate == 100 else ('#faad14' if h_pass_rate >= 60 else '#ff4d4f')

            if h_error > 0:
                badge_type, badge_text = 'error', f'失败 {h_error}'
            elif h_warning > 0:
                badge_type, badge_text = 'warning', f'告警 {h_warning}'
            else:
                badge_type, badge_text = 'success', '全部正常'

            items = []
            for r in host_items:
                s_text, s_color, s_bg, s_border = self._STATUS_MAP.get(
                    r.status, ('未知', '#8c8c8c', '#fafafa', '#d9d9d9')
                )
                items.append({
                    'name': r.item_name,
                    'status_text': s_text,
                    'status_color': s_color,
                    'status_bg': s_bg,
                    'status_border': s_border,
                    'actual_value': f'{r.actual_value}' if r.actual_value is not None else '',
                    'matched': r.matched or '',
                    'exit_code': r.exit_code if r.exit_code is not None else '',
                    'duration': r.duration,
                    'output': r.output or '',
                })

            hosts.append({
                'name': info['name'],
                'hostname': info['hostname'],
                'h_success': h_success,
                'h_warning': h_warning,
                'h_error': h_error,
                'h_pass_rate': h_pass_rate,
                'h_pass_color': h_pass_color,
                'badge_type': badge_type,
                'badge_text': badge_text,
                'items': items,
            })

        context = {
            'task_name': task.name,
            'task_desc': task.desc or '',
            'now': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'total': total,
            'success': success,
            'warning': warning,
            'error_count': error_count,
            'pending': pending,
            'pass_rate': pass_rate,
            'pass_color': pass_color,
            'is_normal': warning == 0 and error_count == 0,
            'host_count': len(host_map),
            'item_count': len(set(r.item_id for r in results)),
            'hosts': hosts,
        }

        html = render_to_string('exec/inspect_report.html', context)
        filename = f"inspect_report_{task.name}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
        response = HttpResponse(html, content_type='text/html; charset=utf-8')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response
