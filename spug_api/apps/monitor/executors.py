# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django_redis import get_redis_connection
from apps.host.models import Host
from apps.monitor.utils import handle_notify
from socket import socket
import subprocess
import platform
import requests
import logging
import json
import time
import re

logging.captureWarnings(True)
regex = re.compile(r'Failed to establish a new connection: (.*)\'\)+')


def site_check(url, limit):
    try:
        res = requests.get(url, timeout=30)
        if limit:
            duration = int(res.elapsed.total_seconds() * 1000)
            if duration > int(limit):
                return False, f'响应时间 {duration}ms 大于 {limit}ms'
        return 200 <= res.status_code < 400, f'返回HTTP状态码 {res.status_code}'
    except Exception as e:
        error = e.__str__()
        exps = re.findall(regex, error)
        if exps:
            error = exps[0]
        return False, error


def port_check(addr, port):
    try:
        sock = socket()
        sock.settimeout(5)
        sock.connect((addr, int(port)))
        sock.close()
        return True, '端口状态检测正常'
    except Exception as e:
        return False, f'异常信息：{e}'


def ping_check(addr):
    try:
        if platform.system().lower() == 'windows':
            command = f'ping -n 1 -w 3000 {addr}'
        else:
            command = f'ping -c 1 -W 3 {addr}'
        task = subprocess.run(command, shell=True, stdout=subprocess.PIPE)
        if task.returncode == 0:
            return True, 'Ping检测正常'
        else:
            return False, 'Ping检测失败'
    except Exception as e:
        return False, f'异常信息：{e}'


def host_executor(host, command):
    try:
        with host.get_ssh() as ssh:
            exit_code, out = ssh.exec_command_raw(command)
        if exit_code == 0:
            return True, out or '检测状态正常'
        else:
            return False, out or f'退出状态码：{exit_code}'
    except Exception as e:
        return False, f'异常信息：{e}'


def http_advanced_check(url, config):
    try:
        cfg = json.loads(config) if isinstance(config, str) else (config or {})
        method = cfg.get('method', 'GET').upper()
        headers = cfg.get('headers', {})
        body = cfg.get('body')
        timeout = cfg.get('timeout', 30)
        expected_codes = cfg.get('expected_codes', [200, 201, 204])
        max_response_time = cfg.get('max_response_time')

        res = requests.request(method, url, headers=headers, data=body, timeout=timeout)
        if res.status_code not in expected_codes:
            return False, f'HTTP状态码 {res.status_code} 不在期望范围 {expected_codes}'
        if max_response_time:
            duration = int(res.elapsed.total_seconds() * 1000)
            if duration > max_response_time:
                return False, f'响应时间 {duration}ms 大于 {max_response_time}ms'
        return True, f'HTTP检测正常，状态码 {res.status_code}'
    except Exception as e:
        return False, f'异常信息：{e}'


def database_check(addr, config):
    try:
        cfg = json.loads(config) if isinstance(config, str) else (config or {})
        db_type = cfg.get('db_type', 'mysql')
        port = cfg.get('port', 3306)
        port = int(port) if str(port).strip().isdigit() else 3306
        username = cfg.get('username', '')
        password = cfg.get('password', '')
        sql = cfg.get('sql', 'SELECT 1')
        expected = cfg.get('expected')

        if db_type == 'mysql':
            import pymysql
            conn = pymysql.connect(host=addr, port=port, user=username, password=password, connect_timeout=10)
        elif db_type == 'postgresql':
            import psycopg2
            conn = psycopg2.connect(host=addr, port=port, user=username, password=password, connect_timeout=10)
        else:
            return False, f'不支持的数据库类型: {db_type}'

        with conn.cursor() as cursor:
            cursor.execute(sql)
            result = cursor.fetchone()
        conn.close()

        if expected is not None and result and result[0] != expected:
            return False, f'查询结果 {result[0]} 不等于期望值 {expected}'
        return True, f'数据库检测正常，查询结果: {result[0] if result else None}'
    except Exception as e:
        return False, f'异常信息：{e}'


def log_keyword_check(host_id, config):
    try:
        cfg = json.loads(config) if isinstance(config, str) else (config or {})
        file_path = cfg.get('file_path', '')
        keyword = cfg.get('keyword', '')
        lines = cfg.get('lines', 100)

        host = Host.objects.filter(pk=host_id).first()
        if not host:
            return False, f'未知主机ID: {host_id!r}'

        command = f'tail -n {lines} {file_path} | grep -c "{keyword}"'
        with host.get_ssh() as ssh:
            exit_code, out = ssh.exec_command_raw(command)
        if exit_code == 0:
            count = int(out.strip()) if out.strip().isdigit() else 0
            if count > 0:
                return False, f'日志文件 {file_path} 中发现 {count} 处关键词 "{keyword}" 匹配'
            return True, f'日志检测正常，未发现关键词 "{keyword}"'
        return False, f'命令执行失败，退出码: {exit_code}'
    except Exception as e:
        return False, f'异常信息：{e}'


def prometheus_check(url, config):
    try:
        cfg = json.loads(config) if isinstance(config, str) else (config or {})
        query = cfg.get('query', '')
        expected_op = cfg.get('operator', '>')
        expected_val = float(cfg.get('value', 0))

        res = requests.get(
            f"{url.rstrip('/')}/api/v1/query",
            params={'query': query},
            timeout=15
        )
        data = res.json()
        if data.get('status') != 'success':
            return False, f'Prometheus查询失败: {data.get("error", "unknown")}'

        result = data.get('data', {}).get('result', [])
        if not result:
            return False, 'Prometheus查询结果为空'

        value = float(result[0]['value'][1])
        ops = {'>': value > expected_val, '<': value < expected_val,
               '>=': value >= expected_val, '<=': value <= expected_val,
               '==': value == expected_val, '!=': value != expected_val}
        is_ok = ops.get(expected_op, False)

        if is_ok:
            return True, f'Prometheus指标 {query} = {value} 满足 {expected_op} {expected_val}'
        return False, f'Prometheus指标 {query} = {value} 不满足 {expected_op} {expected_val}'
    except Exception as e:
        return False, f'异常信息：{e}'


def playbook_check(host_id, config):
    """通过 Playbook 执行复杂检测"""
    try:
        cfg = json.loads(config) if isinstance(config, str) else (config or {})
        playbook_id = cfg.get('playbook_id')
        expected_exit_code = cfg.get('expected_exit_code', 0)
        keyword = cfg.get('keyword', '')
        extra_vars = cfg.get('extra_vars', {})

        if not playbook_id:
            return False, '未指定 Playbook'

        from apps.playbook.models import Playbook
        from apps.playbook.runner import build_dynamic_inventory
        from libs.execution.ansible_executor import AnsibleExecutor
        from apps.setting.utils import AppSetting

        playbook = Playbook.objects.filter(pk=playbook_id, is_active=True).first()
        if not playbook:
            return False, f'Playbook {playbook_id} 不存在或已停用'

        host = Host.objects.filter(pk=host_id).first()
        if not host:
            return False, f'未知主机: {host_id}'

        inventory = build_dynamic_inventory([host.id], playbook.group_id)
        executor = AnsibleExecutor(host.hostname, host.port or 22, host.username)
        output_parts = []
        final_code = -1

        with executor:
            from apps.playbook.runner import _write_pkey_files
            _write_pkey_files(inventory, [host], executor._tmpdir)
            executor.set_inventory(inventory)
            forks = playbook.forks or AppSetting.get_default('ansible_forks', 20)
            for code, output in executor.exec_playbook(playbook.content, extra_vars=extra_vars, forks=forks):
                if output:
                    output_parts.append(output)
                if code != -1:
                    final_code = code

        if final_code == -1:
            final_code = 1

        output_text = ''.join(output_parts)

        if final_code != expected_exit_code:
            return False, f'Playbook 退出码 {final_code} 不等于期望值 {expected_exit_code}'

        if keyword and keyword not in output_text:
            return False, f'输出中未包含关键词 "{keyword}"'

        return True, f'Playbook 检测正常，退出码 {final_code}'

    except Exception as e:
        return False, f'Playbook 检测异常: {e}'


def monitor_worker_handler(job):
    task_id, tp, addr, extra, threshold, quiet = json.loads(job)
    target = addr
    if tp == '1':
        is_ok, message = site_check(addr, extra)
    elif tp == '2':
        is_ok, message = port_check(addr, extra)
    elif tp == '5':
        is_ok, message = ping_check(addr)
    elif tp == '6':
        is_ok, message = http_advanced_check(addr, extra)
    elif tp == '7':
        is_ok, message = database_check(addr, extra)
    elif tp == '8':
        is_ok, message = log_keyword_check(addr, extra)
        host = Host.objects.filter(pk=addr).first()
        if host:
            target = f'{host.name}({host.hostname})'
    elif tp == '9':
        is_ok, message = prometheus_check(addr, extra)
    elif tp == '10':
        is_ok, message = playbook_check(addr, extra)
        host = Host.objects.filter(pk=addr).first()
        if host:
            target = f'{host.name}({host.hostname})'
    elif tp not in ('3', '4'):
        is_ok, message = False, f'invalid monitor type for {tp!r}'
    else:
        command = f'ps -ef|grep -v grep|grep {extra!r}' if tp == '3' else extra
        host = Host.objects.filter(pk=addr).first()
        if not host:
            is_ok, message = False, f'unknown host id for {addr!r}'
        else:
            is_ok, message = host_executor(host, command)
        target = f'{host.name}({host.hostname})'

    rds, key, f_count, f_time = get_redis_connection(), f'spug:det:{task_id}', f'c_{addr}', f't_{addr}'
    v_count, v_time = rds.hmget(key, f_count, f_time)
    if is_ok:
        if v_count:
            rds.hdel(key, f_count, f_time)
        if v_time:
            logging.warning('send recovery notification')
            handle_notify(task_id, target, is_ok, message, int(v_count) + 1)
        return
    v_count = rds.hincrby(key, f_count)
    if v_count >= threshold:
        if not v_time or int(time.time()) - int(v_time) >= quiet * 60:
            rds.hset(key, f_time, int(time.time()))
            logging.warning('send fault alarm notification')
            handle_notify(task_id, target, is_ok, message, v_count)


def dispatch(tp, addr, extra):
    if tp == '1':
        return site_check(addr, extra)
    elif tp == '2':
        return port_check(addr, extra)
    elif tp == '5':
        return ping_check(addr)
    elif tp == '6':
        return http_advanced_check(addr, extra)
    elif tp == '7':
        return database_check(addr, extra)
    elif tp == '8':
        return log_keyword_check(addr, extra)
    elif tp == '9':
        return prometheus_check(addr, extra)
    elif tp == '10':
        return playbook_check(addr, extra)
    elif tp == '3':
        command = f'ps -ef|grep -v grep|grep {extra!r}'
    elif tp == '4':
        command = extra
    else:
        raise TypeError(f'invalid monitor type: {tp!r}')
    host = Host.objects.filter(pk=addr).first()
    return host_executor(host, command)
