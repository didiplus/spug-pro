# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
"""Facts 采集与缓存管理"""
from django.db import connections
from libs.execution.ansible_executor import AnsibleExecutor
from apps.ansible.models import HostFacts
from apps.host.models import Host
from apps.setting.utils import AppSetting
import json
import time
import logging

logger = logging.getLogger(__name__)


def facts_worker_handler(job):
    """Worker 队列处理函数"""
    data = json.loads(job)
    import threading
    t = threading.Thread(target=collect_batch_facts, args=(data['host_ids'],), daemon=True)
    t.start()


def collect_host_facts(host_id: int) -> dict:
    """
    采集单主机 Facts
    1. 获取 Host
    2. 创建 AnsibleExecutor
    3. 执行 setup 模块
    4. 解析结果
    5. 存储到 HostFacts
    返回 {host_id, success, facts, error}
    """
    host = Host.objects.filter(pk=host_id).first()
    if not host:
        return {'host_id': host_id, 'success': False, 'error': '主机不存在'}

    pkey = host.pkey or AppSetting.get_default('private_key')

    executor = AnsibleExecutor(
        host.hostname, host.port or 22, host.username,
        pkey=pkey, connect_timeout=30
    )

    try:
        with executor:
            exit_code, facts_dict = executor.collect_facts()

        if exit_code != 0:
            return {'host_id': host_id, 'success': False, 'error': f'采集失败，退出码: {exit_code}'}

        if not facts_dict:
            return {'host_id': host_id, 'success': False, 'error': '未获取到 Facts 数据'}

        host_key = host.hostname
        if host_key in facts_dict:
            facts = facts_dict[host_key]
        elif host.name in facts_dict:
            facts = facts_dict[host.name]
        else:
            facts = list(facts_dict.values())[0] if facts_dict else {}

        ansible_version = facts.get('ansible_version', '')

        HostFacts.objects.update_or_create(
            host_id=host_id,
            defaults={
                'facts': json.dumps(facts),
                'ansible_version': ansible_version,
                'collected_at': __import__('libs').human_datetime(),
            }
        )

        logger.info(f'Facts 采集成功: host={host.name}')
        return {'host_id': host_id, 'success': True, 'facts': facts}

    except Exception as e:
        logger.error(f'Facts 采集异常 host={host.name}: {e}', exc_info=True)
        return {'host_id': host_id, 'success': False, 'error': str(e)}
    finally:
        try:
            connections.close_all()
        except Exception:
            pass


def collect_batch_facts(host_ids: list) -> dict:
    """
    批量采集 Facts
    1. 逐台执行 collect_host_facts（避免并发对目标主机造成压力）
    2. 返回 {host_id: result}
    """
    results = {}
    for host_id in host_ids:
        result = collect_host_facts(host_id)
        results[host_id] = result
        time.sleep(0.5)
    return results


def get_cached_facts(host_id: int) -> dict:
    """从缓存读取 Facts"""
    facts = HostFacts.objects.filter(host_id=host_id).first()
    if not facts:
        return {}
    return facts.to_view()


def format_facts_for_display(facts: dict) -> dict:
    """
    格式化 Facts 用于前端展示
    提取关键信息: os, cpu, memory, disk, network, python_version
    """
    if not facts:
        return {}

    summary = {
        'os': f"{facts.get('ansible_distribution', '')} {facts.get('ansible_distribution_version', '')}".strip(),
        'os_family': facts.get('ansible_os_family', ''),
        'architecture': facts.get('ansible_architecture', ''),
        'kernel': facts.get('ansible_kernel', ''),
        'hostname': facts.get('ansible_hostname', ''),
        'fqdn': facts.get('ansible_fqdn', ''),
        'python_version': facts.get('ansible_python_version', ''),
        'cpu_count': facts.get('ansible_processor_vcpus', 0),
        'cpu_cores': facts.get('ansible_processor_cores', 0),
        'memory_mb': facts.get('ansible_memtotal_mb', 0),
        'memory_gb': round(facts.get('ansible_memtotal_mb', 0) / 1024, 2),
        'swap_mb': facts.get('ansible_swaptotal_mb', 0),
    }

    ipv4 = facts.get('ansible_default_ipv4', {})
    if isinstance(ipv4, dict):
        summary['default_ipv4'] = {
            'address': ipv4.get('address', ''),
            'interface': ipv4.get('interface', ''),
            'macaddress': ipv4.get('macaddress', ''),
            'netmask': ipv4.get('netmask', ''),
            'network': ipv4.get('network', ''),
        }

    all_ipv4 = facts.get('ansible_all_ipv4_addresses', [])
    if all_ipv4:
        summary['all_ipv4'] = all_ipv4

    mounts = facts.get('ansible_mounts', [])
    if mounts:
        summary['mounts'] = []
        for m in mounts:
            summary['mounts'].append({
                'device': m.get('device', ''),
                'mount': m.get('mountpoint', ''),
                'fstype': m.get('fstype', ''),
                'size_total_gb': round(m.get('size_total', 0) / 1024 / 1024 / 1024, 2),
                'size_available_gb': round(m.get('size_available', 0) / 1024 / 1024 / 1024, 2),
                'used_pct': m.get('size_total', 0) and round(
                    (1 - m.get('size_available', 0) / m.get('size_total', 1)) * 100, 1
                ),
            })

    devices = facts.get('ansible_devices', {})
    if devices:
        summary['block_devices'] = list(devices.keys())

    summary['virtualization_type'] = facts.get('ansible_virtualization_type', '')
    summary['virtualization_role'] = facts.get('ansible_virtualization_role', '')

    selinux = facts.get('ansible_selinux', {})
    if isinstance(selinux, dict):
        summary['selinux'] = selinux.get('mode', 'disabled')

    return summary


def get_facts_summary(host_id: int) -> dict:
    """获取单主机 Facts 摘要（用于列表展示）"""
    facts = HostFacts.objects.filter(host_id=host_id).first()
    if not facts:
        return {}
    try:
        raw = json.loads(facts.facts)
        return format_facts_for_display(raw)
    except (json.JSONDecodeError, TypeError):
        return {}