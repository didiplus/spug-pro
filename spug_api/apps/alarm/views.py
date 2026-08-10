# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.views.generic import View
from django.db.models import Count, Q
from libs import json_response, JsonParser, Argument, auth
from libs.spug import Notification
from libs.push import get_contacts
from apps.alarm.models import Alarm, Group, Contact, ContactChannel, AlarmPolicy
from apps.monitor.models import Detection
from apps.setting.utils import AppSetting
from libs.ratelimit import rate_limit, by_user
from datetime import datetime, timedelta
import json


# 旧 Contact 拍平字段 -> ContactChannel.type 映射
CHANNEL_FIELD_MAP = {
    'email': 'email',
    'ding': 'ding',
    'wx_token': 'wx_token',
    'qy_wx': 'qy_wx',
    'feishu': 'feishu',
}
# 带有 secret 的渠道
SECRET_CHANNELS = {'ding', 'feishu'}


class AlarmView(View):
    @auth('alarm.alarm.view')
    def get(self, request):
        form, error = JsonParser(
            Argument('group_by', required=False),
            Argument('fingerprint', required=False),
        ).parse(request.GET, True)
        if error is None:
            qs = Alarm.objects.all()
            if form.get('fingerprint'):
                qs = qs.filter(fingerprint=form.fingerprint)
            if form.get('group_by') == 'fingerprint':
                grouped = {}
                for alarm in qs:
                    fp = alarm.fingerprint or 'unknown'
                    if fp not in grouped:
                        grouped[fp] = {
                            'fingerprint': fp,
                            'name': alarm.name,
                            'type': alarm.type,
                            'target': alarm.target,
                            'count': 0,
                            'latest_status': alarm.status,
                            'latest_created_at': alarm.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                            'is_escalated': False,
                        }
                    grouped[fp]['count'] += 1
                    if alarm.is_escalated:
                        grouped[fp]['is_escalated'] = True
                return json_response(list(grouped.values()))
            return json_response(list(qs))
        return json_response(error=error)


class AlarmPolicyView(View):
    @auth('alarm.policy.view')
    def get(self, request):
        policies = AlarmPolicy.objects.all()
        return json_response(policies)

    @auth('alarm.policy.view')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
            Argument('name', help='请输入策略名称'),
            Argument('desc', required=False),
            Argument('silence_window', type=int, default=30),
            Argument('escalate_after', type=int, required=False),
            Argument('escalate_to', type=list, default=[]),
            Argument('repeat_interval', type=int, required=False),
            Argument('is_active', type=bool, default=True),
        ).parse(request.body)
        if error is None:
            if form.id:
                AlarmPolicy.objects.filter(pk=form.id).update(**form)
            else:
                form.created_by = request.user
                AlarmPolicy.objects.create(**form)
        return json_response(error=error)

    @auth('alarm.policy.view')
    def delete(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象')
        ).parse(request.GET)
        if error is None:
            det = Detection.objects.filter(alarm_policy=form.id).first()
            if det:
                return json_response(error=f'监控任务【{det.name}】正在使用该策略，请解除关联后再删除')
            AlarmPolicy.objects.filter(pk=form.id).delete()
        return json_response(error=error)


@auth('alarm.alarm.view')
def get_alarm_trend(request):
    form, error = JsonParser(
        Argument('hours', type=int, default=24),
    ).parse(request.GET, True)
    if error is None:
        now = datetime.now()
        start = now - timedelta(hours=form.hours)
        alarms = Alarm.objects.filter(created_at__gte=start)

        hourly = {}
        for i in range(form.hours):
            h = (start + timedelta(hours=i)).strftime('%Y-%m-%d %H:00')
            hourly[h] = {'time': h, 'alert': 0, 'recovery': 0}

        for a in alarms:
            h = a.created_at.strftime('%Y-%m-%d %H:00')
            if h in hourly:
                if a.status == '1':
                    hourly[h]['alert'] += 1
                else:
                    hourly[h]['recovery'] += 1

        top_targets = list(
            alarms.filter(status='1')
            .values('name', 'target')
            .annotate(count=Count('id'))
            .order_by('-count')[:10]
        )

        recoveries = alarms.filter(status='2')
        mttr_seconds = 0
        if recoveries:
            for r in recoveries:
                first_alert = Alarm.objects.filter(
                    fingerprint=r.fingerprint, status='1', created_at__lte=r.created_at
                ).order_by('-created_at').first()
                if first_alert:
                    mttr_seconds += (r.created_at - first_alert.created_at).total_seconds()
            mttr_seconds = int(mttr_seconds / len(recoveries))

        return json_response({
            'hourly': list(hourly.values()),
            'top_targets': top_targets,
            'total_alerts': alarms.filter(status='1').count(),
            'total_recoveries': len(recoveries),
            'mttr_seconds': mttr_seconds,
        })
    return json_response(error=error)


class GroupView(View):
    @auth('alarm.group.view|monitor.monitor.add|monitor.monitor.edit|alarm.alarm.view')
    def get(self, request):
        groups = Group.objects.all()
        return json_response(groups)

    @auth('alarm.group.add|alarm.group.edit')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
            Argument('name', help='请输入组名'),
            Argument('contacts', type=list, help='请选择联系人'),
            Argument('desc', required=False)
        ).parse(request.body)
        if error is None:
            form.contacts = form.contacts or []
            if form.id:
                Group.objects.filter(pk=form.id).update(**form)
            else:
                form.created_by = request.user
                Group.objects.create(**form)
        return json_response(error=error)

    @auth('alarm.group.del')
    def delete(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象')
        ).parse(request.GET)
        if error is None:
            for det in Detection.objects.filter(notify_grp__contains=str(form.id)):
                grp_ids = json.loads(det.notify_grp) if det.notify_grp else []
                if form.id in grp_ids:
                    return json_response(error=f'监控任务【{det.name}】正在使用该报警组，请解除关联后再尝试删除该联系组')
            Group.objects.filter(pk=form.id).delete()
        return json_response(error=error)


class ContactView(View):
    @auth('alarm.contact.view|alarm.group.view|schedule.schedule.add|schedule.schedule.edit')
    def get(self, request):
        form, error = JsonParser(
            Argument('with_push', required=False),
            Argument('only_push', required=False),
        ).parse(request.GET)
        if error is None:
            response = []
            if form.with_push or form.only_push:
                push_key = AppSetting.get_default('spug_push_key')
                if push_key:
                    response = get_contacts(push_key)
                if form.only_push:
                    return json_response(response)

            for item in Contact.objects.prefetch_related('channels').all():
                response.append(item.to_dict())
            return json_response(response)
        return json_response(error=error)

    @auth('alarm.contact.add|alarm.contact.edit')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
            Argument('name', help='请输入联系人姓名'),
            Argument('phone', required=False),
            Argument('email', required=False),
            Argument('ding', required=False),
            Argument('wx_token', required=False),
            Argument('qy_wx', required=False),
            Argument('feishu', required=False),
            Argument('secret', required=False),
        ).parse(request.body)
        if error is None:
            secrets = json.loads(form.secret) if form.secret else {}
            channels_data = []
            for field, ctype in CHANNEL_FIELD_MAP.items():
                value = getattr(form, field, None)
                if value:
                    csec = secrets.get(ctype) if ctype in SECRET_CHANNELS else None
                    channels_data.append((ctype, value, csec))

            if form.id:
                Contact.objects.filter(pk=form.id).update(name=form.name, phone=form.phone)
                contact = Contact.objects.get(pk=form.id)
                contact.channels.all().delete()
            else:
                contact = Contact.objects.create(name=form.name, phone=form.phone, created_by=request.user)

            for ctype, identifier, csec in channels_data:
                ContactChannel.objects.create(contact=contact, type=ctype, identifier=identifier, secret=csec)
        return json_response(error=error)

    @auth('alarm.contact.del')
    def delete(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象')
        ).parse(request.GET)
        if error is None:
            for group in Group.objects.all():
                if form.id in (group.contacts or []):
                    return json_response(error=f'报警联系组【{group.name}】包含此联系人，请解除关联后再尝试删除该联系人')
            Contact.objects.filter(pk=form.id).delete()
        return json_response(error=error)


@auth('alarm.contact.add|alarm.contact.edit')
@rate_limit(rate='1/30s', key_func=by_user)
def handle_test(request):
    form, error = JsonParser(
        Argument('mode', help='参数错误'),
        Argument('value', help='参数错误'),
        Argument('secret', required=False),
    ).parse(request.body)
    if error is None:
        notify = Notification(None, '1', 'https://spug.cc', 'Spug官网（测试）', '这是一条测试告警信息', None)
        if form.mode == '3':
            notify.monitor_by_dd([(form.value, form.secret)])
        elif form.mode == '4':
            notify.monitor_by_email([form.value])
        elif form.mode == '5':
            notify.monitor_by_qy_wx([form.value])
        elif form.mode == '7':
            notify.monitor_by_fs([(form.value, form.secret)])
    return json_response(error=error)
