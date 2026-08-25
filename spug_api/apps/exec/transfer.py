# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.views.generic import View
from django.conf import settings
from django.db import close_old_connections
from django_redis import get_redis_connection
from apps.exec.models import Transfer
from apps.account.utils import has_host_perm
from apps.host.models import Host
from apps.setting.utils import AppSetting
from libs import json_response, JsonParser, Argument, auth
from libs.utils import human_seconds_time
from libs.execution.factory import ExecutorFactory
from concurrent import futures
from threading import Thread
import subprocess
import uuid
import json
import time
import os
import shlex


class TransferView(View):
    @auth('exec.transfer.do')
    def get(self, request):
        records = Transfer.objects.filter(user=request.user)
        return json_response([x.to_view() for x in records])

    @auth('exec.transfer.do')
    def post(self, request):
        data = request.POST.get('data')
        form, error = JsonParser(
            Argument('host', required=False),
            Argument('dst_dir', help='请输入目标路径'),
            Argument('host_ids', type=list, filter=lambda x: len(x), help='请选择目标主机'),
        ).parse(data)
        if error is None:
            if not has_host_perm(request.user, form.host_ids):
                return json_response(error='无权访问主机，请联系管理员')
            host_id = None
            token = uuid.uuid4().hex
            base_dir = os.path.join(settings.TRANSFER_DIR, token)
            if form.host:
                host_id, path = json.loads(form.host)
                if not path.strip('/'):
                    return json_response(error='请输入正确的数据源路径')
                host = Host.objects.get(pk=host_id)
                with host.get_ssh() as ssh:
                    code, _ = ssh.exec_command_raw(f'[ -d {shlex.quote(path)} ]')
                    if code != 0:
                        return json_response(error='数据源路径必须为该主机上已存在的目录')
                os.makedirs(base_dir)
                with tempfile.NamedTemporaryFile(mode='w') as fp:
                    fp.write(host.pkey or AppSetting.get('private_key'))
                    fp.flush()
                    target = f'{host.username}@{host.hostname}:{path}'
                    # 使用参数列表形式调用 sshfs，避免命令注入
                    ssh_cmd = ['ssh', '-p', str(host.port), '-i', fp.name]
                    command = ['sshfs', '-o', 'ro', '-o', f'ssh_command=ssh -p {host.port} -i {fp.name}', target, base_dir]
                    task = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
                    if task.returncode != 0:
                        # 使用 subprocess.run 替代 os.system，避免命令注入
                        try:
                            subprocess.run(['umount', '-f', base_dir], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                            subprocess.run(['rm', '-rf', base_dir], check=False)
                        except Exception:
                            pass
                        return json_response(error=task.stdout.decode())
            else:
                os.makedirs(base_dir)
                index = 0
                while True:
                    file = request.FILES.get(f'file{index}')
                    if not file:
                        break
                    with open(os.path.join(base_dir, file.name), 'wb') as f:
                        for chunk in file.chunks():
                            f.write(chunk)
                    index += 1
            Transfer.objects.create(
                user=request.user,
                digest=token,
                host_id=host_id,
                src_dir=base_dir,
                dst_dir=form.dst_dir,
                host_ids=json.dumps(form.host_ids),
            )
            return json_response(token)
        return json_response(error=error)

    @auth('exec.transfer.do')
    def patch(self, request):
        form, error = JsonParser(
            Argument('token', help='参数错误')
        ).parse(request.body)
        if error is None:
            task = Transfer.objects.get(digest=form.token)
            Thread(target=_dispatch_sync, args=(task,)).start()
        return json_response(error=error)


def _dispatch_sync(task):
    rds = get_redis_connection()
    threads = []
    max_workers = max(10, os.cpu_count() * 5)
    with futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        for host in Host.objects.filter(id__in=json.loads(task.host_ids)):
            t = executor.submit(_do_sync, rds, task, host)
            t.token = task.digest
            t.key = host.id
            threads.append(t)
        for t in futures.as_completed(threads):
            exc = t.exception()
            if exc:
                rds.publish(
                    t.token,
                    json.dumps({'key': t.key, 'status': -1, 'data': f'\x1b[31mException: {exc}\x1b[0m'})
                )
    if task.host_id:
        # 使用 subprocess.run 替代 shell=True，避免命令注入
        try:
            subprocess.run(['umount', '-f', task.src_dir], check=False)
            subprocess.run(['rm', '-rf', task.src_dir], check=False)
        except Exception:
            pass
    else:
        subprocess.run(['rm', '-rf', task.src_dir], check=False)
    close_old_connections()


def _do_sync(rds, task, host):
    token = task.digest
    rds.publish(token, json.dumps({'key': host.id, 'data': '\r\n\x1b[36m### Executing ...\x1b[0m\r\n'}))

    executor = ExecutorFactory.create(
        hostname=host.hostname,
        port=host.port,
        username=host.username,
        pkey=host.private_key,
    )

    archive = bool(task.host_id)
    flag = time.time()
    status = -1

    try:
        for code, line in executor.transfer_file(task.src_dir, task.dst_dir, archive=archive):
            if line:
                rds.publish(token, json.dumps({'key': host.id, 'data': line}))
            if code != -1:
                status = code
    except Exception as e:
        status = -1
        rds.publish(token, json.dumps({'key': host.id, 'data': f'\x1b[31mException: {e}\x1b[0m'}))

    if status == 0:
        human_time = human_seconds_time(time.time() - flag)
        rds.publish(token, json.dumps({'key': host.id, 'data': f'\r\n\x1b[32m** 分发完成，总耗时：{human_time} **\x1b[0m'}))
    rds.publish(token, json.dumps({'key': host.id, 'status': status}))
