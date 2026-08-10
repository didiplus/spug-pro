# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
"""Playbook 执行引擎，由 worker 调度"""
from django_redis import get_redis_connection
from django.db import connections
from libs.execution.ansible_executor import AnsibleExecutor
from libs.utils import human_seconds_time
from apps.playbook.models import Playbook, PlaybookRun, Role
from apps.playbook.security import validate_playbook_content, filter_extra_vars, sanitize_playbook_roles
from apps.host.models import Host
from apps.ansible.models import HostVariable, InventoryGroup, VaultSecret
from apps.setting.utils import AppSetting

import shutil
import json
import time
import os
import logging

logger = logging.getLogger(__name__)


def playbook_worker_handler(job):
    """Worker 队列处理函数"""
    data = json.loads(job)
    threading_run_playbook(data)


def threading_run_playbook(data):
    import threading
    t = threading.Thread(target=run_playbook, args=(data,), daemon=True)
    t.start()


def _send(rds, token, message):
    """通过 Redis pub/sub 推送消息，同时持久化到 LIST 供历史回放"""
    data = json.dumps(message)
    rds.publish(token, data)
    rds.rpush(f'spug:pb:log:{token}', data)


def build_dynamic_inventory(host_ids: list, group_id: int = None) -> dict:
    """
    构建动态 Inventory
    1. 查询 Host 列表
    2. 查询 HostVariable
    3. 查询 InventoryGroup + group_vars
    4. 查询 VaultSecret 并解密
    5. 组装 inventory 结构
    """
    hosts = Host.objects.filter(id__in=host_ids)
    if not hosts.exists():
        raise ValueError('未找到目标主机')

    host_map = {h.id: h for h in hosts}
    inventory = {'all': {'hosts': {}}}

    for h in hosts:
        hv = {
            'ansible_host': h.hostname,
            'ansible_port': h.port or 22,
            'ansible_user': h.username,
            'ansible_ssh_common_args': '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null',
        }
        pkey = h.pkey or AppSetting.get_default('private_key')
        if pkey:
            hv['ansible_ssh_private_key_file'] = f'__SPUG_PKEY_{h.id}__'
        inventory['all']['hosts'][h.name] = hv

    host_vars = {}
    for hv in HostVariable.objects.filter(host_id__in=host_ids):
        host = host_map.get(hv.host_id)
        if not host:
            continue
        if host.name not in host_vars:
            host_vars[host.name] = {}
        value = hv.value
        if hv.value_type == 'json':
            try:
                value = json.loads(hv.value)
            except (json.JSONDecodeError, TypeError):
                pass
        elif hv.value_type == 'bool':
            value = hv.value == 'true'
        elif hv.value_type == 'int':
            try:
                value = int(hv.value)
            except (ValueError, TypeError):
                pass

        host_vars[host.name][hv.key] = value

    for hname, vars_dict in host_vars.items():
        if hname in inventory['all']['hosts']:
            inventory['all']['hosts'][hname].update(vars_dict)

    if group_id:
        groups = InventoryGroup.objects.all()
        for g in groups:
            gvars = json.loads(g.variables) if g.variables else {}
            if gvars:
                gname = g.name
                if gname not in inventory:
                    inventory[gname] = {'vars': gvars}
                else:
                    inventory[gname]['vars'] = gvars
                host_ids_in_group = [h.id for h in g.hosts.all()]
                if host_ids_in_group:
                    host_names = [host_map[hid].name for hid in host_ids_in_group if hid in host_map]
                    if host_names:
                        inventory[gname]['hosts'] = {hn: {} for hn in host_names}

    for vs in VaultSecret.objects.all():
        try:
            plain = vs.encrypted_value
            for hname in inventory['all']['hosts']:
                inventory['all']['hosts'][hname][vs.key] = plain
        except Exception as e:
            logger.warning(f'Vault 注入失败 {vs.key}: {e}')

    return inventory


def prepare_roles(role_names: list, tmpdir: str) -> None:
    """
    准备 Role 目录
    1. 从 DB 查询 Role
    2. 复制到 private_data_dir/roles/
    3. 处理 requirements.yml (Galaxy 依赖)
    """
    roles_dir = os.path.join(tmpdir, 'roles')
    os.makedirs(roles_dir, exist_ok=True)

    for name in role_names:
        role = Role.objects.filter(name=name, is_active=True).first()
        if not role:
            logger.warning(f'Role {name} 不存在或已停用')
            continue
        if os.path.isdir(role.path):
            dest = os.path.join(roles_dir, name)
            if os.path.exists(dest):
                shutil.rmtree(dest)
            shutil.copytree(role.path, dest)
            logger.info(f'Role {name} 已复制到 {dest}')
        else:
            logger.warning(f'Role {name} 路径不存在: {role.path}')

    active_roles = Role.objects.filter(is_active=True)
    req_content = []
    for r in active_roles:
        if r.requirements:
            try:
                reqs = json.loads(r.requirements) if r.requirements.startswith('[') else None
                if reqs:
                    req_content.extend(reqs)
            except (json.JSONDecodeError, TypeError):
                pass
    if req_content:
        import yaml
        req_path = os.path.join(roles_dir, 'requirements.yml')
        with open(req_path, 'w') as f:
            yaml.safe_dump(req_content, f)
        logger.info(f'Requirements 文件已生成: {req_path}')


def _write_pkey_files(inventory: dict, hosts: list, tmpdir: str) -> None:
    """将主机密钥写入临时文件，替换 inventory 中的占位符"""
    for h in hosts:
        pkey = h.pkey or AppSetting.get_default('private_key')
        if not pkey:
            continue
        placeholder = f'__SPUG_PKEY_{h.id}__'
        pkey_path = os.path.join(tmpdir, f'id_rsa_{h.name}')
        with open(pkey_path, 'w') as f:
            f.write(pkey)
        os.chmod(pkey_path, 0o600)
        if 'all' in inventory and 'hosts' in inventory['all']:
            for hname, hv in inventory['all']['hosts'].items():
                if hv.get('ansible_ssh_private_key_file') == placeholder:
                    hv['ansible_ssh_private_key_file'] = pkey_path


def run_playbook(data: dict) -> None:
    """
    Playbook 执行入口（由 worker 调度）
    data: {run_id, token, playbook_id, host_ids, extra_vars, run_tags, skip_tags, check_mode}
    """
    run_id = data['run_id']
    token = data['token']
    playbook_id = data['playbook_id']
    host_ids = data['host_ids']
    extra_vars = data.get('extra_vars', {})
    run_tags = data.get('run_tags')
    skip_tags = data.get('skip_tags')
    check_mode = data.get('check_mode', False)

    rds = get_redis_connection()
    start_time = time.time()

    def send(message):
        _send(rds, token, message)

    try:
        run = PlaybookRun.objects.filter(pk=run_id).first()
        if not run:
            logger.error(f'PlaybookRun {run_id} 不存在')
            return

        playbook = Playbook.objects.filter(pk=playbook_id).first()
        if not playbook:
            send({'status': 'failed', 'message': 'Playbook 不存在'})
            _update_run_status(run_id, 'failed', 0)
            return

        hosts = list(Host.objects.filter(id__in=host_ids))
        if not hosts:
            send({'status': 'failed', 'message': '未找到目标主机'})
            _update_run_status(run_id, 'failed', 0)
            return

        send({'status': 'running', 'message': '\x1b[36m### 正在构建 Inventory...\x1b[0m\r\n'})

        inventory = build_dynamic_inventory(host_ids, playbook.group_id)
        send({'status': 'running', 'message': '\x1b[32mInventory 构建完成\x1b[0m\r\n'})

        is_valid, sec_error = validate_playbook_content(playbook.content)
        if not is_valid:
            send({'status': 'failed', 'message': f'\r\n\x1b[31m### 安全检查失败: {sec_error}\x1b[0m\r\n'})
            _update_run_status(run_id, 'failed', 0)
            return

        allowed_roles = {r.name for r in Role.objects.filter(is_active=True)}
        role_ok, role_error, used_roles = sanitize_playbook_roles(playbook.content, allowed_roles)
        if not role_ok:
            send({'status': 'failed', 'message': f'\r\n\x1b[31m### Role 检查失败: {role_error}\x1b[0m\r\n'})
            _update_run_status(run_id, 'failed', 0)
            return

        extra_vars = filter_extra_vars(extra_vars)

        pb_content = playbook.content

        send({'status': 'running', 'message': '\x1b[36m### 开始执行 Playbook...\x1b[0m\r\n'})

        executor = AnsibleExecutor(hosts[0].hostname, hosts[0].port or 22, hosts[0].username)
        with executor:
            _write_pkey_files(inventory, hosts, executor._tmpdir)
            executor.set_inventory(inventory)

            if used_roles:
                try:
                    prepare_roles(list(used_roles), executor._tmpdir)
                    send({'status': 'running', 'message': f'\x1b[32mRole 准备完成: {", ".join(used_roles)}\x1b[0m\r\n'})
                except Exception as e:
                    send({'status': 'failed', 'message': f'\r\n\x1b[31m### Role 准备失败: {e}\x1b[0m\r\n'})
                    _update_run_status(run_id, 'failed', 0)
                    return

            try:
                from apps.ansible.vault import get_vault_password_file
                vp_file = get_vault_password_file(executor._tmpdir)
                if vp_file:
                    executor.set_vault_password_file(vp_file)
            except Exception:
                pass

            tags_list = run_tags.split(',') if run_tags else None
            skip_tags_list = skip_tags.split(',') if skip_tags else None
            forks = playbook.forks or AppSetting.get_default('ansible_forks', 20)
            timeout = playbook.timeout or 0

            final_code = -1
            for code, output in executor.exec_playbook(
                pb_content,
                extra_vars=extra_vars,
                tags=tags_list,
                skip_tags=skip_tags_list,
                check_mode=check_mode,
                forks=forks,
                timeout=timeout,
            ):
                if output:
                    send({'status': 'running', 'message': output})
                if code != -1:
                    final_code = code

        duration = int(time.time() - start_time)
        human_time = human_seconds_time(duration)
        send({'status': 'running', 'message': f'\r\n\x1b[36m** 执行结束，总耗时：{human_time} **\x1b[0m'})

        stats = executor.stats or {}
        status = 'success' if final_code == 0 else 'failed'
        _update_run_status(run_id, status, duration, stats)
        send({'status': status, 'code': final_code, 'duration': duration, 'stats': stats})
        rds.expire(f'spug:pb:log:{token}', 14 * 24 * 60 * 60)

    except Exception as e:
        logger.error(f'Playbook 执行异常: {e}', exc_info=True)
        duration = int(time.time() - start_time)
        _update_run_status(run_id, 'failed', duration)
        send({'status': 'failed', 'message': f'\r\n\x1b[31m### 执行异常: {e}\x1b[0m\r\n', 'code': 131})
    finally:
        try:
            connections.close_all()
        except Exception:
            pass


def _update_run_status(run_id: int, status: str, duration: int, stats: dict = None) -> None:
    """更新执行记录状态"""
    try:
        updates = {'status': status, 'duration': duration}
        if stats is not None:
            updates['stats'] = json.dumps(stats)
        PlaybookRun.objects.filter(pk=run_id).update(**updates)
    except Exception as e:
        logger.error(f'更新执行记录失败: {e}')

