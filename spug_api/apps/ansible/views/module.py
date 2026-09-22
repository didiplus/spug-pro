# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.views.generic import View
from libs import json_response, auth
import subprocess
import json

MODULE_CATEGORIES = {
    "files": ["copy", "file", "fetch", "synchronize", "archive", "unarchive",
              "template", "blockinfile", "lineinfile", "replace", "stat"],
    "packages": ["yum", "apt", "dnf", "pip", "gem", "npm", "package"],
    "services": ["systemd", "service", "sysvinit", "supervisorctl"],
    "network": ["uri", "get_url", "slurp"],
    "commands": ["shell", "command", "raw", "script"],
    "system": ["user", "group", "cron", "hostname", "timezone", "sysctl",
               "mount", "authorized_key", "known_hosts"],
    "monitoring": ["setup", "debug", "assert", "fail", "wait_for", "pause"],
}


class ModuleView(View):
    @auth('ansible.modules.view')
    def get(self, request, name=None):
        if name:
            try:
                result = subprocess.run(
                    ['ansible-doc', '--json', name],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10
                )
                if result.returncode == 0:
                    doc = json.loads(result.stdout.decode())
                    return json_response(doc)
                return json_response(error=f'获取模块文档失败: {result.stderr.decode()[:200]}')
            except FileNotFoundError:
                return json_response(error='ansible-doc 未安装')
            except Exception as e:
                return json_response(error=f'获取模块文档失败: {e}')
        return json_response({
            'categories': MODULE_CATEGORIES,
            'modules': [m for mods in MODULE_CATEGORIES.values() for m in mods],
        })