# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.conf import settings
from django_redis import get_redis_connection
from asgiref.sync import async_to_sync
from apps.host.models import Host, SSHSession
from consumer.utils import BaseConsumer
from apps.account.utils import has_host_perm
from libs.utils import str_decode, get_request_real_ip
from threading import Thread
import time
import json
import uuid
import os


class ComConsumer(BaseConsumer):
    def connect(self):
        token = self.scope["url_route"]["kwargs"]["token"]
        module = self.scope["url_route"]["kwargs"]["module"]
        if module == "build":
            self.key = f"{settings.BUILD_KEY}:{token}"
        elif module == "request":
            self.key = f"{settings.REQUEST_KEY}:{token}"
        elif module == "host":
            self.key = token
        else:
            raise TypeError(f"unknown module for {module}")
        self.rds = get_redis_connection()
        super().connect()

    def disconnect(self, code):
        self.rds.close()

    def get_response(self, index):
        counter = 0
        while counter < 30:
            response = self.rds.lindex(self.key, index)
            if response:
                return response.decode()
            counter += 1
            time.sleep(0.2)

    def receive(self, text_data="", **kwargs):
        if text_data.isdigit():
            index = int(text_data)
            response = self.get_response(index)
            while response:
                index += 1
                self.send(text_data=response)
                response = self.get_response(index)
        self.send(text_data="pong")


class SSHConsumer(BaseConsumer):
    def connect(self):
        self.id = self.scope["url_route"]["kwargs"]["id"]
        self.chan = None
        self.ssh = None
        self._closed = False
        self._session = None
        self._recording_file = None
        self._session_start = 0
        super().connect()

    def _write_record(self, event_type, data):
        if not self._recording_file:
            return
        try:
            elapsed = round(time.time() - self._session_start, 3)
            line = json.dumps([elapsed, event_type, data])
            self._recording_file.write(line + '\n')
            self._recording_file.flush()
        except Exception:
            pass

    def loop_read(self):
        is_ready, data = False, b""
        while not self._closed:
            try:
                if not self.chan.recv_ready():
                    time.sleep(0.02)
                    continue
                out = self.chan.recv(32 * 1024)
            except Exception:
                break
            if not out:
                break
            data += out
            try:
                text = data.decode()
            except UnicodeDecodeError:
                try:
                    text = data.decode(encoding="GBK")
                except UnicodeDecodeError:
                    time.sleep(0.01)
                    if self.chan.recv_ready():
                        continue
                    text = data.decode(errors="ignore")

            if not is_ready:
                self.send(text_data="\033[2J\033[3J\033[1;1H")
                is_ready = True
            self.send(text_data=text)
            self._write_record('o', text)
            data = b""

    def receive(self, text_data=None, bytes_data=None):
        data = text_data or bytes_data
        if data and self.chan:
            data = json.loads(data)
            resize = data.get("resize")
            if resize and len(resize) == 2:
                self.chan.resize_pty(*resize)
            else:
                self.chan.send(data["data"])
                self._write_record('i', data["data"])

    def disconnect(self, code):
        self._closed = True
        if self.chan:
            try:
                self.chan.close()
            except Exception:
                pass
        if self.ssh:
            try:
                self.ssh.close()
            except Exception:
                pass
        if self._recording_file:
            try:
                self._recording_file.close()
            except Exception:
                pass
        if self._session:
            try:
                from django.db import close_old_connections
                close_old_connections()
                duration = int(time.time() - self._session_start)
                file_size = 0
                if self._session.file_path and os.path.exists(self._session.file_path):
                    file_size = os.path.getsize(self._session.file_path)
                SSHSession.objects.filter(pk=self._session.pk).update(
                    end_time=__import__('libs').human_datetime(),
                    duration=duration,
                    status='closed' if duration > 0 else 'abnormal',
                    file_size=file_size,
                )
            except Exception:
                pass

    def init(self):
        if has_host_perm(self.user, self.id):
            self.send(text_data="\r\n正在连接至主机 ...")
            host = Host.objects.filter(pk=self.id).first()
            if not host:
                return self.close_with_message("未找到指定主机，请刷新页面重试。")

            try:
                self.ssh = host.get_ssh().get_client()
            except Exception as e:
                return self.close_with_message(f"连接主机失败: {e}")

            self.chan = self.ssh.invoke_shell(term="xterm")
            self.chan.transport.set_keepalive(30)

            self._start_recording(host)
            Thread(target=self.loop_read, daemon=True).start()
        else:
            self.close_with_message("你当前无权限操作该主机，请联系管理员授权。")

    def _start_recording(self, host):
        try:
            session_dir = settings.SSH_SESSION_DIR
            os.makedirs(session_dir, exist_ok=True)
            token = uuid.uuid4().hex
            file_path = os.path.join(session_dir, f"{token}.cast")

            client_ip = get_request_real_ip(dict(
                (k.decode() if isinstance(k, bytes) else k,
                 v.decode() if isinstance(v, bytes) else v)
                for k, v in self.scope.get("headers", [])
            ))

            self._session = SSHSession.objects.create(
                token=token,
                user=self.user,
                host=host,
                host_name=host.name,
                host_hostname=host.hostname,
                client_ip=client_ip or '',
                file_path=file_path,
            )

            self._recording_file = open(file_path, 'w', encoding='utf-8')
            self._session_start = time.time()

            header = json.dumps({
                "version": 2,
                "width": 80,
                "height": 24,
                "timestamp": int(self._session_start),
                "env": {"SHELL": "/bin/bash", "TERM": "xterm"},
                "title": f"{self.user.username}@{host.name}",
            })
            self._recording_file.write(header + '\n')
            self._recording_file.flush()
        except Exception:
            self._session = None
            self._recording_file = None


class NotifyConsumer(BaseConsumer):
    def init(self):
        async_to_sync(self.channel_layer.group_add)("notify", self.channel_name)

    def disconnect(self, code):
        async_to_sync(self.channel_layer.group_discard)("notify", self.channel_name)

    def receive(self, **kwargs):
        self.send(text_data="pong")

    def notify_message(self, event):
        self.send(text_data=json.dumps(event))


class PubSubConsumer(BaseConsumer):
    def connect(self):
        self.token = self.scope["url_route"]["kwargs"]["token"]
        self.rds = get_redis_connection()
        self.p = self.rds.pubsub(ignore_subscribe_messages=True)
        self.p.subscribe(self.token)
        super().connect()

    def init(self):
        if self.token.startswith('spug:pipeline:log:'):
            pipe_token = self.token.replace('spug:pipeline:log:', '', 1)
            log_key = f'spug:pipeline:{pipe_token}'
        else:
            log_key = f'spug:pb:log:{self.token}'
        messages = self.rds.lrange(log_key, 0, -1)
        for msg in messages:
            self.send(text_data=msg.decode())

    def disconnect(self, code):
        self.p.close()
        self.rds.close()

    def receive(self, **kwargs):
        response = self.p.get_message(timeout=10)
        while response:
            data = str_decode(response["data"])
            self.send(text_data=data)
            response = self.p.get_message(timeout=10)
        self.send(text_data="pong")
