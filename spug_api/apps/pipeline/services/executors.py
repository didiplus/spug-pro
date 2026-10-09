from django_redis import get_redis_connection
from apps.host.models import Host
from apps.notify.models import Notify
from libs.execution.factory import ExecutorFactory
from apps.exec.executors import build_command, build_host_env, _EXECUTING_HINT
from concurrent.futures import ThreadPoolExecutor
import json
import time
import logging

logger = logging.getLogger(__name__)

_MAX_PARALLEL_HOSTS = 20


class BaseTaskExecutor:
    def __init__(self, task_run, variables, publish_channel):
        self.task_run = task_run
        self.variables = variables
        self.publish_channel = publish_channel
        self.rds = get_redis_connection()

    def _publish(self, message):
        try:
            self.rds.publish(self.publish_channel, json.dumps(message))
        except Exception:
            pass

    def _send_output(self, text):
        self.task_run.output = (self.task_run.output or "") + text
        self.task_run.save(update_fields=["output"])
        self._publish({"task_id": self.task_run.id, "data": text})

    def _send_status(self, status, exit_code=None, error=None):
        self._publish({"task_id": self.task_run.id, "status": status, "exit_code": exit_code, "error": error})

    def run(self):
        raise NotImplementedError


class ExecExecutor(BaseTaskExecutor):
    def run(self):
        config = json.loads(self.task_run.task_config) if isinstance(self.task_run.task_config, str) else self.task_run.task_config
        command = config.get("command", "")
        interpreter = config.get("interpreter", "sh")
        host_ids = config.get("host_ids", [])
        if not command:
            self._send_output("错误: 未指定执行命令\n")
            return 1, "未指定执行命令"
        if not host_ids:
            self._send_output("错误: 未选择目标主机\n")
            return 1, "未选择目标主机"

        hosts = list(Host.objects.filter(id__in=host_ids).values("id", "hostname", "port", "username", "pkey"))
        if not hosts:
            self._send_output("错误: 未找到目标主机\n")
            return 1, "未找到目标主机"

        wrapped_command = build_command(command, interpreter)
        results = {}
        output_lines = []

        def _exec_one(host):
            host_id = host["id"]
            env = build_host_env(host, interpreter, self.variables)
            self._send_output(f"\n--- {host['hostname']} ---\n")
            code = -1
            try:
                executor = ExecutorFactory.create(
                    host["hostname"], host.get("port", 22),
                    host.get("username", "root"), host.get("pkey"),
                    default_env=env, connect_timeout=10
                )
                with executor:
                    for code, out in executor.exec_command_with_stream(wrapped_command, env):
                        if out:
                            self._send_output(out)
                            output_lines.append(out)
            except Exception as e:
                self._send_output(f"\n错误: {e}\n")
                code = 131
            return host_id, code

        with ThreadPoolExecutor(max_workers=min(len(hosts), _MAX_PARALLEL_HOSTS)) as pool:
            futures = [pool.submit(_exec_one, h) for h in hosts]
            for future in futures:
                host_id, code = future.result()
                results[host_id] = code

        success_count = sum(1 for c in results.values() if c == 0)
        total = len(results)
        self._send_output(f"\n--- 执行完成: {success_count}/{total} 成功 ---\n")
        exit_code = 0 if success_count == total else 1
        return exit_code, None


class ScriptExecutor(BaseTaskExecutor):
    def run(self):
        config = json.loads(self.task_run.task_config) if isinstance(self.task_run.task_config, str) else self.task_run.task_config
        script = config.get("script", "")
        interpreter = config.get("interpreter", "sh")
        host_ids = config.get("host_ids", [])
        if not script:
            self._send_output("错误: 未指定脚本内容\n")
            return 1, "未指定脚本内容"
        config["command"] = script
        self.task_run.task_config = json.dumps(config)
        return ExecExecutor(self.task_run, self.variables, self.publish_channel).run()


class NotificationExecutor(BaseTaskExecutor):
    def run(self):
        config = json.loads(self.task_run.task_config) if isinstance(self.task_run.task_config, str) else self.task_run.task_config
        title = config.get("title", "流水线通知")
        content = config.get("content", "")
        notify_type = config.get("notify_type", "system")

        for key, val in self.variables.items():
            title = title.replace(f"${{{key}}}", str(val))
            content = content.replace(f"${{{key}}}", str(val))

        self._send_output(f"发送通知: {title}\n")
        try:
            Notify.make_system_notify(title, content)
            self._send_output("通知发送成功\n")
            return 0, None
        except Exception as e:
            self._send_output(f"通知发送失败: {e}\n")
            return 1, str(e)


class BuildExecutor(BaseTaskExecutor):
    def run(self):
        config = json.loads(self.task_run.task_config) if isinstance(self.task_run.task_config, str) else self.task_run.task_config
        build_command = config.get("command", "")
        work_dir = config.get("work_dir", "")
        env_vars = config.get("env_vars", {})

        for key, val in self.variables.items():
            build_command = build_command.replace(f"${{{key}}}", str(val))
            work_dir = work_dir.replace(f"${{{key}}}", str(val))

        self._send_output(f"执行构建命令: {build_command}\n")
        if work_dir:
            self._send_output(f"工作目录: {work_dir}\n")

        import subprocess
        import os

        env = os.environ.copy()
        if isinstance(env_vars, dict):
            env.update({k: str(v) for k, v in env_vars.items()})
        if isinstance(self.variables, dict):
            env.update({f"SPUG_{k}": str(v) for k, v in self.variables.items()})

        try:
            process = subprocess.Popen(
                build_command, shell=True, cwd=work_dir or None,
                env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, bufsize=1
            )
            for line in process.stdout:
                self._send_output(line)
            process.wait()
            exit_code = process.returncode
            if exit_code == 0:
                self._send_output("\n构建成功\n")
            else:
                self._send_output(f"\n构建失败 (退出码: {exit_code})\n")
            return exit_code, None
        except Exception as e:
            self._send_output(f"\n构建异常: {e}\n")
            return 1, str(e)


TASK_EXECUTORS = {
    "exec": ExecExecutor,
    "script": ScriptExecutor,
    "notification": NotificationExecutor,
    "build": BuildExecutor,
}


def get_executor(task_type):
    return TASK_EXECUTORS.get(task_type)