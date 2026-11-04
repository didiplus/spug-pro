# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django_redis import get_redis_connection
from libs.helper import make_ali_request, make_tencent_request
from libs.ssh import SSH, AuthenticationException
from libs.utils import AttrDict, human_datetime
from libs.validators import ip_validator
from apps.host.models import HostExtend, Host
from apps.setting.utils import AppSetting
from collections import defaultdict
from datetime import datetime, timezone
from concurrent import futures
from threading import Semaphore
import ipaddress
import json
import logging
import math
import os
import time

logger = logging.getLogger(__name__)


def _retry(fn, max_retries=3, base_delay=2):
    def wrapper(*args, **kwargs):
        last_exc = None
        for attempt in range(max_retries):
            try:
                return fn(*args, **kwargs)
            except Exception as e:
                last_exc = e
                if attempt < max_retries - 1:
                    delay = base_delay * (2 ** attempt)
                    logger.warning(f"Retry {attempt + 1}/{max_retries} for {fn.__name__}: {e}, waiting {delay}s")
                    time.sleep(delay)
        raise last_exc
    return wrapper


BATCH_MAX_WORKERS = 20
BATCH_RATE_LIMIT = 10
BATCH_CHUNK_SIZE = 50
BATCH_CHUNK_DELAY = 2


def check_os_type(os_name):
    os_name = os_name.lower()
    types = ('centos', 'coreos', 'debian', 'suse', 'ubuntu', 'windows', 'freebsd', 'tencent', 'alibaba', 'fedora')
    for t in types:
        if t in os_name:
            return t
    return 'unknown'


def check_instance_charge_type(value, supplier):
    if supplier == 'ali':
        if value in ('PrePaid', 'PostPaid'):
            return value
        else:
            return 'Other'
    if supplier == 'tencent':
        if value == 'PREPAID':
            return 'PrePaid'
        if value == 'POSTPAID_BY_HOUR':
            return 'PostPaid'
        return 'Other'


def check_internet_charge_type(value, supplier):
    if supplier == 'ali':
        if value in ('PayByTraffic', 'PayByBandwidth'):
            return value
        else:
            return 'Other'
    if supplier == 'tencent':
        if value == 'TRAFFIC_POSTPAID_BY_HOUR':
            return 'PayByTraffic'
        if value in ('BANDWIDTH_PREPAID', 'BANDWIDTH_POSTPAID_BY_HOUR'):
            return 'PayByBandwidth'
        return 'Other'


def parse_utc_date(value):
    if not value:
        return None
    s_format = '%Y-%m-%dT%H:%M:%SZ'
    if len(value) == 17:
        s_format = '%Y-%m-%dT%H:%MZ'
    date = datetime.strptime(value, s_format).replace(tzinfo=timezone.utc)
    return date.astimezone().strftime('%Y-%m-%d %H:%M:%S')


def fetch_ali_regions(ak, ac):
    params = dict(Action='DescribeRegions')
    res = make_ali_request(ak, ac, 'http://ecs.aliyuncs.com', params)
    if 'Regions' in res:
        return res['Regions']['Region']
    else:
        raise Exception(res)


def fetch_ali_disks(ak, ac, region_id):
    data, page_size, page_number = defaultdict(list), 20, 1
    while True:
        params = dict(
            Action='DescribeDisks',
            RegionId=region_id,
            PageNumber=page_number,
            PageSize=page_size
        )
        res = make_ali_request(ak, ac, 'http://ecs.aliyuncs.com', params)
        if 'Disks' not in res:
            raise Exception(res)
        for item in res['Disks']['Disk']:
            data[item['InstanceId']].append(item['Size'])
        if len(res['Disks']['Disk']) < page_size:
            break
        page_number += 1
    return data


def fetch_ali_instances(ak, ac, region_id):
    data, page_size, page_number = {}, 20, 1
    _ali_req = _retry(make_ali_request)
    while True:
        params = dict(
            Action='DescribeInstances',
            RegionId=region_id,
            PageNumber=page_number,
            PageSize=page_size
        )
        res = _ali_req(ak, ac, 'http://ecs.aliyuncs.com', params)
        if 'Instances' not in res:
            raise Exception(res)
        for item in res['Instances']['Instance']:
            if 'NetworkInterfaces' in item:
                network_interface = item['NetworkInterfaces']['NetworkInterface']
            else:
                network_interface = []
            data[item['InstanceId']] = dict(
                instance_id=item['InstanceId'],
                instance_name=item['InstanceName'],
                os_name=item['OSName'],
                os_type=check_os_type(item['OSName']),
                cpu=item['Cpu'],
                memory=item['Memory'] / 1024,
                created_time=parse_utc_date(item['CreationTime']),
                expired_time=parse_utc_date(item['ExpiredTime']),
                instance_charge_type=check_instance_charge_type(item['InstanceChargeType'], 'ali'),
                internet_charge_type=check_internet_charge_type(item['InternetChargeType'], 'ali'),
                public_ip_address=item['PublicIpAddress']['IpAddress'],
                private_ip_address=[x['PrimaryIpAddress'] for x in network_interface if x.get('PrimaryIpAddress')],
                zone_id=item['ZoneId']
            )
        if len(res['Instances']['Instance']) < page_size:
            break
        page_number += 1
    try:
        for instance_id, disk in _retry(fetch_ali_disks)(ak, ac, region_id).items():
            if instance_id in data:
                data[instance_id]['disk'] = disk
    except Exception as e:
        logger.warning(f"Failed to fetch ali disks, skipping: {e}")
    return list(data.values())


def fetch_tencent_regions(ak, ac):
    params = dict(Action='DescribeRegions')
    res = make_tencent_request(ak, ac, 'cvm.tencentcloudapi.com', params)
    if 'RegionSet' in res['Response']:
        return res['Response']['RegionSet']
    else:
        raise Exception(res)


def fetch_tencent_instances(ak, ac, region_id):
    data, page_size, page_number = [], 20, 1
    _tencent_req = _retry(make_tencent_request)
    while True:
        params = dict(
            Action='DescribeInstances',
            Region=region_id,
            Offset=(page_number - 1) * page_size,
            Limit=page_size
        )
        res = _tencent_req(ak, ac, 'cvm.tencentcloudapi.com', params)
        if 'InstanceSet' not in res['Response']:
            raise Exception(res)
        for item in res['Response']['InstanceSet']:
            data_disks = list(map(lambda x: x['DiskSize'], item['DataDisks']))
            internet_charge_type = item['InternetAccessible']['InternetChargeType']
            data.append(dict(
                instance_id=item['InstanceId'],
                instance_name=item['InstanceName'],
                os_name=item['OsName'],
                os_type=check_os_type(item['OsName']),
                cpu=item['CPU'],
                memory=item['Memory'],
                disk=[item['SystemDisk']['DiskSize']] + data_disks,
                created_time=parse_utc_date(item['CreatedTime']),
                expired_time=parse_utc_date(item['ExpiredTime']),
                instance_charge_type=check_instance_charge_type(item['InstanceChargeType'], 'tencent'),
                internet_charge_type=check_internet_charge_type(internet_charge_type, 'tencent'),
                public_ip_address=item['PublicIpAddresses'],
                private_ip_address=item['PrivateIpAddresses'],
                zone_id=item['Placement']['Zone']
            ))
        if len(res['Response']['InstanceSet']) < page_size:
            break
        page_number += 1
    return data


def fetch_host_extend(ssh):
    transport = ssh.client.get_transport() if ssh.client else None
    if transport and 'windows' in transport.remote_version.lower():
        return _fetch_host_extend_windows(ssh)
    return _fetch_host_extend_linux(ssh)


def _fetch_host_extend_windows(ssh):
    response = {'disk': [], 'public_ip_address': [], 'private_ip_address': [], 'cpu': 0, 'memory': 0, 'os_name': ''}
    combined_cmd = (
        'echo ===CPU=== & wmic cpu get NumberOfCores /value 2>nul\n'
        'echo ===OS=== & ver\n'
        'echo ===IP=== & ipconfig 2>nul\n'
        'echo ===MEM=== & wmic computersystem get TotalPhysicalMemory /value 2>nul\n'
        'echo ===END==='
    )
    code, out = ssh.exec_command_raw(combined_cmd, timeout=15)
    if code != 0:
        return response
    sections = {}
    current = None
    for line in out.splitlines():
        line = line.strip()
        if line.startswith('===') and line.endswith('==='):
            current = line[3:-3]
            continue
        if current and current != 'END':
            sections.setdefault(current, []).append(line)
    if 'CPU' in sections:
        for line in sections['CPU']:
            if 'NumberOfCores' in line:
                try:
                    response['cpu'] = int(line.split('=')[1].strip())
                except (ValueError, IndexError):
                    pass
                break
    if 'OS' in sections and sections['OS']:
        response['os_name'] = sections['OS'][-1][:50]
    if 'MEM' in sections:
        for line in sections['MEM']:
            if 'TotalPhysicalMemory' in line:
                try:
                    response['memory'] = math.ceil(int(line.split('=')[1].strip()) / 1024 / 1024 / 1024)
                except (ValueError, IndexError):
                    pass
                break
    return response


def _fetch_host_extend_linux(ssh):
    public_ip_address = set()
    private_ip_address = set()
    response = {'disk': [], 'cpu': 0, 'memory': 0, 'os_name': ''}

    combined_cmd = (
        'echo "===CPU==="; nproc 2>/dev/null || grep -c "^processor" /proc/cpuinfo 2>/dev/null || echo 0\n'
        'echo "===OS==="; cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | awk -F \\" "{print $2}" || cat /etc/issue 2>/dev/null | head -1 | awk "{print $1,$2,$3}"\n'
        'echo "===IP==="; hostname -I 2>/dev/null || echo ""\n'
        'echo "===DISK==="; lsblk -dbn -o SIZE -e 11,7 2>/dev/null || echo ""\n'
        'echo "===MEM==="; cat /proc/meminfo 2>/dev/null | grep MemTotal | awk "{print $2}" || echo 0\n'
        'echo "===END==="'
    )
    code, out = ssh.exec_command_raw(combined_cmd)
    if code != 0:
        return response

    sections = {}
    current = None
    for line in out.splitlines():
        line = line.strip()
        if line.startswith('===') and line.endswith('==='):
            current = line[3:-3]
            continue
        if current and current != 'END':
            sections.setdefault(current, []).append(line)

    if 'CPU' in sections and sections['CPU']:
        try:
            response['cpu'] = int(sections['CPU'][0])
        except ValueError:
            pass

    if 'OS' in sections and sections['OS']:
        os_name = sections['OS'][0]
        if '/etc/os-release' not in os_name and os_name:
            response['os_name'] = os_name[:50]

    if 'IP' in sections and sections['IP']:
        for ip in sections['IP'][0].split():
            if len(ip) > 15:
                continue
            try:
                addr = ipaddress.ip_address(ip)
            except ValueError:
                continue
            is_private = addr.is_private or (
                ipaddress.ip_address('100.64.0.0') <= addr <= ipaddress.ip_address('100.127.255.255')
            )
            if is_private:
                if len(private_ip_address) < 10:
                    private_ip_address.add(ip)
            elif len(public_ip_address) < 10:
                public_ip_address.add(ip)

    ssh_hostname = ssh.arguments.get('hostname')
    if ip_validator(ssh_hostname):
        try:
            addr = ipaddress.ip_address(ssh_hostname)
        except ValueError:
            addr = None
        if addr:
            is_private = addr.is_private or (
                ipaddress.ip_address('100.64.0.0') <= addr <= ipaddress.ip_address('100.127.255.255')
            )
            if is_private:
                if ssh_hostname in private_ip_address:
                    private_ip_address.remove(ssh_hostname)
                private_ip_address = [ssh_hostname] + list(private_ip_address)
            else:
                if ssh_hostname in public_ip_address:
                    public_ip_address.remove(ssh_hostname)
                public_ip_address = [ssh_hostname] + list(public_ip_address)

    if 'DISK' in sections and sections['DISK']:
        disks = []
        for item in sections['DISK']:
            item = item.strip()
            if not item:
                continue
            try:
                size = math.ceil(int(item) / 1024 / 1024 / 1024)
            except ValueError:
                continue
            if size > 10:
                disks.append(size)
        response['disk'] = disks[:10]

    if 'MEM' in sections and sections['MEM']:
        try:
            response['memory'] = math.ceil(int(sections['MEM'][0]) / 1024 / 1024)
        except ValueError:
            pass

    response['public_ip_address'] = list(public_ip_address)
    response['private_ip_address'] = list(private_ip_address)
    return response


def batch_sync_host(token, hosts, password=None, host_passwords=None):
    private_key, public_key = AppSetting.get_ssh_key()
    rds = get_redis_connection()
    max_workers = min(BATCH_MAX_WORKERS, len(hosts))
    rate_limiter = Semaphore(BATCH_RATE_LIMIT)
    verified_ids = []

    def _rate_limited_submit(executor, fn, *args, **kwargs):
        def _wrapped():
            rate_limiter.acquire()
            try:
                return fn(*args, **kwargs)
            finally:
                rate_limiter.release()
        return executor.submit(_wrapped)

    chunks = [hosts[i:i + BATCH_CHUNK_SIZE] for i in range(0, len(hosts), BATCH_CHUNK_SIZE)]
    for chunk in chunks:
        threads = []
        with futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            for host in chunk:
                pwd = host_passwords.get(host.id) if host_passwords else password
                t = _rate_limited_submit(executor, _sync_host_extend, host, private_key, public_key, pwd)
                t.host = host
                threads.append(t)
            for t in futures.as_completed(threads):
                exception = t.exception()
                if exception:
                    rds.rpush(token, json.dumps({'key': t.host.id, 'status': 'fail', 'message': f'{exception}'}))
                else:
                    rds.rpush(token, json.dumps({'key': t.host.id, 'status': 'ok'}))
                    verified_ids.append(t.host.id)
        if verified_ids:
            Host.objects.filter(id__in=verified_ids).update(is_verified=True)
        if len(chunks) > 1:
            time.sleep(BATCH_CHUNK_DELAY)
    rds.expire(token, 600)


def _sync_host_extend(host, private_key=None, public_key=None, password=None, ssh=None):
    if not ssh:
        kwargs = host.to_dict(selects=('hostname', 'port', 'username'))
        with _get_ssh(kwargs, host.pkey, private_key, public_key, password, host_id=host.id) as ssh:
            return _sync_host_extend(host, ssh=ssh)
    form = AttrDict(fetch_host_extend(ssh))
    form.disk = json.dumps(form.get('disk', []))
    form.public_ip_address = json.dumps(form.get('public_ip_address', []))
    form.private_ip_address = json.dumps(form.get('private_ip_address', []))
    form.updated_at = human_datetime()
    form.os_type = check_os_type(form.get('os_name', ''))
    if hasattr(host, 'hostextend'):
        extend = host.hostextend
        extend.update_by_dict(form)
    else:
        extend = HostExtend.objects.create(host=host, **form)
    return extend


def _get_ssh(kwargs, pkey=None, private_key=None, public_key=None, password=None, host_id=None):
    try:
        ssh = SSH(pkey=pkey or private_key, host_id=host_id, **kwargs)
        ssh.get_client()
        return ssh
    except AuthenticationException as e:
        if password:
            with SSH(password=str(password), **kwargs) as ssh:
                ssh.add_public_key(public_key)
            return _get_ssh(kwargs, private_key, host_id=host_id)
        raise e

def run_host_health_check():
    from django.db import close_old_connections
    close_old_connections()
    try:
        hosts = list(Host.objects.filter(is_verified=True))
        if not hosts:
            return
        private_key, public_key = AppSetting.get_ssh_key()
        max_workers = min(BATCH_MAX_WORKERS, len(hosts))
        results = {'online': [], 'offline': []}
        with futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            def _check_host(host):
                try:
                    kwargs = host.to_dict(selects=('hostname', 'port', 'username'))
                    with _get_ssh(kwargs, host.pkey, private_key, public_key, host_id=host.id) as ssh:
                        ssh.ping()
                    return host.id, True
                except Exception:
                    return host.id, False
            for host_id, is_online in executor.map(_check_host, hosts):
                if is_online:
                    results['online'].append(host_id)
                else:
                    results['offline'].append(host_id)
        close_old_connections()
        if results['offline']:
            Host.objects.filter(id__in=results['offline']).update(is_verified=False)
            logger.warning(f"Host health check: {len(results['offline'])} hosts offline: {results['offline'][:20]}")
        logger.info(f"Host health check done: {len(results['online'])} online, {len(results['offline'])} offline")
    except Exception as e:
        logger.error(f"Host health check failed: {e}", exc_info=True)
    finally:
        close_old_connections()
