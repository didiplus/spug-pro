# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.views.generic import View
from libs import json_response, auth
import subprocess
import json

MODULE_CATEGORIES = {
    "files": ["copy", "file", "fetch", "synchronize", "archive", "unarchive",
              "template", "blockinfile", "lineinfile", "replace", "stat",
              "find", "ini_file", "xml", "assemble"],
    "packages": ["yum", "apt", "dnf", "pip", "gem", "npm", "package", "snap",
                 "homebrew", "apt_repository", "yum_repository", "package_facts"],
    "services": ["systemd", "service", "sysvinit", "supervisorctl",
                 "launchd", "service_facts"],
    "network": ["uri", "get_url", "slurp", "nsupdate", "net_ping", "cli_command"],
    "commands": ["shell", "command", "raw", "script", "expect"],
    "system": ["user", "group", "cron", "hostname", "timezone", "sysctl",
               "mount", "authorized_key", "known_hosts", "iptables", "selinux",
               "pam_limits", "reboot", "firewalld", "ufw"],
    "monitoring": ["setup", "debug", "assert", "fail", "wait_for", "pause",
                   "set_stats", "meta"],
    "cloud": ["docker_container", "docker_image", "docker_compose", "vmware_guest"],
    "database": ["mysql_db", "mysql_user", "postgresql_db", "postgresql_user",
                 "redis_info", "mongodb_user"],
    "source_control": ["git_config", "github_issue", "gitlab_project"],
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