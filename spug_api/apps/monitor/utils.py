# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import close_old_connections
from django.core.cache import cache
from apps.alarm.models import Alarm, AlarmPolicy
from apps.monitor.models import Detection
from libs.spug import Notification
import json
import time
import logging

logger = logging.getLogger(__name__)


def seconds_to_human(seconds):
    text = ''
    if seconds > 3600:
        text = f'{int(seconds / 3600)}小时'
        seconds = seconds % 3600
    if seconds > 60:
        text += f'{int(seconds / 60)}分钟'
        seconds = seconds % 60
    if seconds:
        text += f'{seconds}秒'
    return text


def _record_alarm(det, target, duration, status, is_escalated=False):
    fingerprint = Alarm.make_fingerprint(det.name, target)
    Alarm.objects.create(
        name=det.name,
        type=det.get_type_display(),
        target=target,
        status=status,
        duration=duration,
        fingerprint=fingerprint,
        is_escalated=is_escalated,
        notify_grp=json.loads(det.notify_grp) if det.notify_grp else [],
        notify_mode=json.loads(det.notify_mode) if det.notify_mode else [])


def _check_convergence(det, target, policy):
    if not policy:
        return False
    cache_key = f"alarm:silence:{det.id}:{target}"
    last_sent = cache.get(cache_key)
    if last_sent:
        elapsed = time.time() - float(last_sent)
        if elapsed < policy.silence_window * 60:
            return True
    return False


def _mark_sent(det, target, policy):
    if not policy:
        return
    cache_key = f"alarm:silence:{det.id}:{target}"
    cache.set(cache_key, str(time.time()), policy.silence_window * 60)


def _check_escalation(det, target, policy, fault_times):
    if not policy or not policy.escalate_after:
        return False, None
    elapsed_min = det.rate * fault_times
    if elapsed_min >= policy.escalate_after and policy.escalate_to:
        esc_key = f"alarm:escalated:{det.id}:{target}"
        if not cache.get(esc_key):
            cache.set(esc_key, '1', policy.escalate_after * 60)
            return True, policy.escalate_to
    return False, None


def _check_repeat(det, target, policy):
    if not policy or not policy.repeat_interval:
        return True
    cache_key = f"alarm:repeat:{det.id}:{target}"
    last = cache.get(cache_key)
    if last:
        elapsed = time.time() - float(last)
        if elapsed < policy.repeat_interval * 60:
            return False
    cache.set(cache_key, str(time.time()), policy.repeat_interval * 60)
    return True


def handle_notify(task_id, target, is_ok, out, fault_times):
    close_old_connections()
    det = Detection.objects.get(pk=task_id)
    duration = seconds_to_human(det.rate * fault_times * 60)
    event = '2' if is_ok else '1'
    policy = None
    if det.alarm_policy_id and det.alarm_policy and det.alarm_policy.is_active:
        policy = det.alarm_policy

    if not is_ok and policy:
        if _check_convergence(det, target, policy):
            logger.info(f"Alarm suppressed by policy: {det.name}/{target}")
            _record_alarm(det, target, duration, event)
            return
        if not _check_repeat(det, target, policy):
            _record_alarm(det, target, duration, event)
            return

    _record_alarm(det, target, duration, event)

    grp = json.loads(det.notify_grp)
    notify_modes = json.loads(det.notify_mode)

    if not is_ok and policy:
        is_escalated, escalate_to = _check_escalation(det, target, policy, fault_times)
        if is_escalated and escalate_to:
            logger.warning(f"Alarm escalated: {det.name}/{target} -> groups {escalate_to}")
            notify = Notification(escalate_to, event, target, f'[升级] {det.name}', out, duration)
            notify.dispatch_monitor(notify_modes)
            _mark_sent(det, target, policy)
            return

    notify = Notification(grp, event, target, det.name, out, duration)
    notify.dispatch_monitor(notify_modes)
    if not is_ok:
        _mark_sent(det, target, policy)
