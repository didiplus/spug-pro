from django_redis import get_redis_connection
from django.conf import settings
from django.db import close_old_connections
from apps.pipeline.models import PipelineHistory, Pipeline
from apps.host.models import Host
from libs.utils import human_datetime, human_seconds_time, render_str, AttrDict
from libs.execution.factory import ExecutorFactory
from libs.ssh import SSH
from concurrent.futures import ThreadPoolExecutor, as_completed
from apps.notify.models import Notify
import subprocess
import json
import time
import uuid
import os
import re
import logging

logger = logging.getLogger(__name__)

MAX_WORKERS = 20


class SpugError(Exception):
    pass


class PipelineHelper:
    regex = re.compile(r'^((\r\n)*)(.*?)((\r\n)*)$', re.DOTALL)

    def __init__(self, rds, rds_key, pub_channel):
        self.rds = rds
        self.rds_key = rds_key
        self.pub_channel = pub_channel
        self.node_status = {}

    def _send(self, key, data, *, status=""):
        message = {"key": key, "data": data}
        if status:
            message["status"] = status
        payload = json.dumps(message)
        self.rds.rpush(self.rds_key, payload)
        self.rds.publish(self.pub_channel, payload)

    def send_clear(self, key):
        self._send(key, "\033[2J\033[3J\033[1;1H")

    def term_message(self, message, color_mode="info"):
        mode_map = {"info": "36m", "warn": "33m", "error": "31m", "success": "32m"}
        mode = mode_map.get(color_mode, "36m")
        return self.regex.sub(fr'\1\033[{mode}\3\033[0m\4', message)

    def send_info(self, key, message, status=""):
        self._send(key, self.term_message(message, "info"), status=status)

    def send_warn(self, key, message, status=""):
        self._send(key, self.term_message(message, "warn"), status=status)

    def send_success(self, key, message, status=""):
        self._send(key, self.term_message(message, "success"), status=status)

    def send_error(self, key, message, with_break=True):
        message = self.term_message(message, "error")
        if not message.endswith("\r\n"):
            message += "\r\n"
        self._send(key, message, status="error")
        if with_break:
            raise SpugError

    def local_raw(self, command, env=None):
        merged = dict(os.environ)
        if env:
            merged.update({k: str(v) for k, v in env.items()})
        task = subprocess.Popen(command, env=merged, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        message = b""
        while True:
            output = task.stdout.read(1)
            if not output:
                break
            if output in (b"\r", b"\n"):
                message += b"\r\n" if output == b"\n" else b"\r"
                self._send("local", message.decode(errors="ignore"))
                message = b""
            else:
                message += output
        if task.wait() != 0:
            self.send_error("local", f"exit code: {task.returncode}")

    def remote(self, key, ssh, command, env=None):
        code = -1
        for code, out in ssh.exec_command_with_stream(command, environment=env):
            self._send(key, out)
        if code != 0:
            self.send_error(key, f"exit code: {code}")


def pipeline_worker_handler(job):
    data = json.loads(job)
    history_id = data["history_id"]
    try:
        history = PipelineHistory.objects.select_related("pipeline").get(pk=history_id)
        dispatch(history)
    except PipelineHistory.DoesNotExist:
        logger.error(f"PipelineHistory {history_id} not found")
    except Exception as e:
        logger.error(f"Pipeline worker error: {e}", exc_info=True)
        try:
            history = PipelineHistory.objects.get(pk=history_id)
            history.status = 3
            history.error_message = str(e)
            history.finished_at = human_datetime()
            history.save()
        except Exception:
            pass


def _build_graph(nodes):
    node_map = {n["id"]: n for n in nodes}
    upstream = {n["id"]: [] for n in nodes}
    for n in nodes:
        for ds in n.get("downstream", []):
            if ds in upstream:
                upstream[ds].append(n["id"])
    return node_map, upstream


def _topo_layers(nodes):
    node_map, upstream = _build_graph(nodes)
    layers = []
    remaining = set(node_map.keys())
    done = set()
    while remaining:
        layer = [nid for nid in remaining if all(u in done for u in upstream[nid])]
        if not layer:
            layer = list(remaining)
        layers.append(layer)
        done.update(layer)
        remaining -= set(layer)
    return layers, node_map, upstream


def dispatch(history):
    rds = get_redis_connection()
    rds_key = history.deploy_key
    pub_channel = history.pub_channel
    nodes = json.loads(history.nodes)

    helper = PipelineHelper(rds, rds_key, pub_channel)
    rds.delete(rds_key)

    history.status = 1
    history.started_at = human_datetime()
    history.save(update_fields=["status", "started_at"])

    try:
        env = AttrDict(
            SPUG_PIPE_ID=str(history.pipeline_id),
            SPUG_PIPE_NAME=history.pipeline.name,
            SPUG_RUN_ID=str(history.id),
            SPUG_VERSION=history.token,
        )

        layers, node_map, upstream = _topo_layers(nodes)
        node_status = {}

        for layer in layers:
            if len(layer) == 1:
                _exec_node(helper, node_map[layer[0]], node_map, upstream, node_status, env)
            else:
                with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                    futures = {executor.submit(_exec_node, helper, node_map[nid], node_map, upstream, node_status, env): nid for nid in layer}
                    for f in as_completed(futures):
                        f.result()

        history.status = 2
    except SpugError:
        history.status = 3
    except Exception as e:
        logger.error(f"Pipeline execution error: {e}", exc_info=True)
        history.status = 3
        history.error_message = str(e)
    finally:
        close_old_connections()
        history.deploy_status = json.dumps({str(k): v for k, v in node_status.items()} if 'node_status' in dir() else {})
        history.finished_at = human_datetime()
        history.save()
        Pipeline.objects.filter(pk=history.pipeline_id).update(
            latest_at=human_datetime(), latest_status=history.status
        )


def _exec_node(helper, node, node_map, upstream, node_status, env):
    node_id = node["id"]
    key = str(node_id)
    node_status[node_id] = 1

    condition = node.get("condition", "success")
    ups = upstream.get(node_id, [])
    if ups:
        up_results = [node_status.get(u, 0) for u in ups]
        all_success = all(r == 2 for r in up_results)
        any_fail = any(r == 3 for r in up_results)
        if condition == "success" and not all_success:
            node_status[node_id] = 4
            return
        if condition == "error" and not any_fail:
            node_status[node_id] = 4
            return

    helper.send_clear(key)
    helper.send_success(key, "", status="doing")
    module = node.get("module", "")
    node_name = node.get("name", "")
    helper.send_info(key, f"\r\n>>> {node_name} [{module}]\r\n")

    node_env = AttrDict(env.items())
    node_env["SPUG_NODE_ID"] = str(node_id)
    node_env["SPUG_NODE_NAME"] = node_name

    try:
        if module == "ssh_exec":
            _exec_ssh(helper, node, node_env, key)
        elif module == "build":
            _exec_build(helper, node, node_env, key)
        elif module == "parameter":
            _exec_parameter(helper, node, node_env, key)
            for k, v in node_env.items():
                if k.startswith('_SPUG_'):
                    env[k] = v
        elif module == "data_transfer":
            _exec_transfer(helper, node, node_env, key)

        elif module in ("push_dd", "push_fs", "push_wx"):
            _exec_push_webhook(helper, node, node_env, key)
        elif module == "push_spug":
            _exec_push_spug(helper, node, node_env, key)
        else:
            helper.send_warn(key, f"未知模块: {module}，跳过\r\n")
        node_status[node_id] = 2
        helper.send_success(key, f"\r\n** 执行完成 **\r\n", status="success")
    except SpugError:
        node_status[node_id] = 3
        raise
    except Exception as e:
        node_status[node_id] = 3
        helper.send_error(key, f"Exception: {e}", with_break=False)
        raise


def _exec_parameter(helper, node, env, key):
    helper.send_info(key, f"解析参数配置\r\n")
    vars_map = []
    for item in node.get("static_params", []):
        if len(item) == 2 and item[0] and item[1] is not None:
            env[f"_SPUG_{item[0]}"] = item[1]
            vars_map.append(f"{item[0]} = {item[1]}")
    for item in node.get("dynamic_params", []):
        if not item.get("variable"):
            continue
        value = item.get("default", "")
        if item.get("required") and not value:
            helper.send_error(key, f"动态参数 {item.get('name', '')} 未配置默认值")
        env[f"_SPUG_{item['variable']}"] = value
        vars_map.append(f"{item['variable']} = {value}")
    if vars_map:
        helper.send_info(key, "动态参数：\r\n")
        for item in vars_map[:5]:
            helper.send_info(key, f"  {item}\r\n")
    helper.send_success(key, f"** 参数解析完成 **\r\n")


def _exec_ssh(helper, node, env, key):
    targets = node.get("targets", [])
    command = render_str(node.get("command", ""), env)
    interpreter = node.get("interpreter", "sh")
    helper.send_info(key, f"目标主机: {targets}\r\n")
    for h_id in targets:
        host = Host.objects.filter(pk=h_id).first()
        if not host:
            helper.send_error(key, f"主机 {h_id} 不存在")
        host_env = AttrDict(env.items())
        host_env["SPUG_HOST_ID"] = str(h_id)
        host_env["SPUG_HOST_NAME"] = host.hostname
        executor = ExecutorFactory.create(
            host.hostname, host.port, host.username, host.private_key,
            default_env=host_env, connect_timeout=10
        )
        with executor:
            helper.send_info(key, f"\r\n--- {host.hostname} ---\r\n")
            helper.remote(key, executor, f"cd /tmp && {command}", host_env)


def _exec_build(helper, node, env, key):
    workspace = node.get("workspace", "/tmp")
    command = render_str(node.get("command", ""), env)
    target = node.get("target")
    helper.send_info(key, f"工作目录: {workspace}\r\n")
    if target:
        helper.send_info(key, f"构建主机: {target}\r\n")
        host = Host.objects.filter(pk=target).first()
        if not host:
            helper.send_error(key, f"构建主机 {target} 不存在")
        executor = ExecutorFactory.create(
            host.hostname, host.port, host.username, host.private_key,
            default_env=env, connect_timeout=10
        )
        with executor:
            helper.remote(key, executor, f"cd {workspace} && {command}", env)
    else:
        helper.local_raw(f"cd {workspace} && {command}", env)


def _exec_transfer(helper, node, env, key):
    src = node.get("source", {})
    dst = node.get("destination", {})
    src_path = render_str(src.get("path", ""), env)
    dst_path = render_str(dst.get("path", ""), env)
    dst_targets = dst.get("targets", [])

    if not src_path:
        helper.send_error(key, "未配置源文件路径")
    if not os.path.exists(src_path):
        helper.send_error(key, f"源文件不存在: {src_path}")
    file_size = os.path.getsize(src_path)
    src_name = os.path.basename(src_path)
    if dst_path.endswith('/'):
        remote_file = dst_path + src_name
        remote_dir = dst_path.rstrip('/')
    else:
        remote_file = dst_path
        remote_dir = os.path.dirname(dst_path)
    helper.send_info(key, f"本地上传: {src_path} ({file_size} bytes) -> {remote_file}\r\n")
    for dt in dst_targets:
        dst_host = Host.objects.filter(pk=dt).first()
        if not dst_host:
            helper.send_warn(key, f"目标主机 {dt} 不存在，跳过\r\n")
            continue
        helper.send_info(key, f"\r\n--- local -> {dst_host.hostname} ---\r\n")
        try:
            with SSH(dst_host.hostname, dst_host.port, dst_host.username, dst_host.private_key,
                     default_env=env, connect_timeout=10) as ssh:
                ssh.exec_command_raw(f"mkdir -p {remote_dir}")
                ssh.put_file(src_path, remote_file)
            helper.send_success(key, f"  上传成功 {dst_host.hostname}:{remote_file}\r\n")
        except Exception as e:
            helper.send_error(key, f"上传到 {dst_host.hostname} 失败: {e}", with_break=False)


def _exec_push_webhook(helper, node, env, key):
    import requests
    url = node.get("url", "")
    title = render_str(node.get("title", ""), env)
    body = render_str(node.get("body", ""), env)
    at_all = node.get("at_all", False)
    module = node.get("module", "push_dd")
    helper.send_info(key, f"推送通知: {title}\r\n")
    if module == "push_dd":
        content = body + ("\n\n@所有人" if at_all else "")
        payload = {"msgtype": "markdown", "markdown": {"title": title, "text": content}}
    elif module == "push_fs":
        payload = {"msg_type": "text", "content": {"text": f"{title}\n{body}"}}
    else:
        payload = {"msgtype": "markdown", "markdown": {"content": f"## {title}\n{body}"}}
    try:
        resp = requests.post(url, json=payload, timeout=10)
        if resp.status_code == 200:
            helper.send_success(key, "推送成功\r\n")
        else:
            helper.send_error(key, f"推送失败: {resp.status_code} {resp.text}", with_break=False)
    except Exception as e:
        helper.send_error(key, f"推送异常: {e}", with_break=False)


def _exec_push_spug(helper, node, env, key):
    title = render_str(node.get("title", ""), env)
    body = render_str(node.get("body", ""), env)
    helper.send_info(key, f"推送通知: {title}\r\n")
    try:
        Notify.make_system_notify(title, body)
        helper.send_success(key, "推送成功\r\n")
    except Exception as e:
        helper.send_error(key, f"推送异常: {e}", with_break=False)


def start_pipeline_run(pipeline, user, trigger_type="manual"):
    token = uuid.uuid4().hex
    history = PipelineHistory.objects.create(
        pipeline=pipeline,
        token=token,
        status=0,
        nodes=pipeline.nodes,
        created_by=user,
    )
    return history
