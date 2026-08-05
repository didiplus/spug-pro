# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from apps.host.models import Group
import re,json,copy
from typing import Dict, Any
from django.http import HttpRequest


def get_host_perms(user):
    ids = sub_ids = set(user.group_perms)
    while sub_ids:
        sub_ids = [x.id for x in Group.objects.filter(parent_id__in=sub_ids)]
        ids.update(sub_ids)
    return set(x.host_id for x in Group.hosts.through.objects.filter(group_id__in=ids))


def has_host_perm(user, target):
    if user.is_supper:
        return True
    host_ids = get_host_perms(user)
    if isinstance(target, (list, set, tuple)):
        return set(target).issubset(host_ids)
    return int(target) in host_ids


def verify_password(password):
    if len(password) < 8:
        return False
    if not all(map(lambda x: re.findall(x, password), ['[0-9]', '[a-z]', '[A-Z]'])):
        return False
    return True



from typing import Any, Dict

# 敏感字段集合（小写，用于快速 O(1) 查找）
SENSITIVE_FIELDS = {
    "password",
    "passwd",
    "pwd",
    "token",
    "secret",
    "private_key",
    "access_token",
}


def mask_sensitive(data: Any) -> Any:
    """
    递归脱敏字典中的敏感字段值。

    若输入为字典，则遍历所有键值对：
        - 若键（忽略大小写）属于 SENSITIVE_FIELDS，则值替换为 "******"
        - 若值为字典，则递归调用本函数
        - 否则保持原值不变
    若输入非字典，则原样返回。

    Args:
        data: 任意类型数据，通常为字典

    Returns:
        脱敏后的数据（若输入为字典则返回新字典，否则原样返回）
    """
    if not isinstance(data, dict):
        return data

    result = {}
    for key, value in data.items():
        # 判断键名（忽略大小写）是否在敏感字段集合中
        if key.lower() in SENSITIVE_FIELDS:
            result[key] = "******"
        elif isinstance(value, dict):
            result[key] = mask_sensitive(value)
        else:
            result[key] = value
    return result




def get_request_params(request: HttpRequest) -> Dict[str, Any]:
    """
    从 Django 请求中提取参数并脱敏。

    - 对 GET 请求：返回 request.GET 的字典副本（已脱敏）
    - 对 POST/PUT/PATCH 请求：解析 JSON 请求体并脱敏
    - 若解析失败或 body 为空，返回空字典

    Args:
        request: Django HttpRequest 对象

    Returns:
        脱敏后的参数字典，若出错则返回空字典
    """
    if request.method in ("POST", "PUT", "PATCH"):
        if not request.body:
            return {}
        try:
            data = json.loads(request.body)  # 可直接接受 bytes
        except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
            return {}
        return mask_sensitive(data)

    # GET 请求或其它方法
    return mask_sensitive(request.GET.dict())







def get_module(path: str) -> str:
    """
    从请求路径中提取模块名（即路径的第二段）。

    例如：
        /api/user/           -> 'user'
        /api/user            -> 'user'
        /admin/dashboard/    -> 'dashboard'
        /                    -> 'unknown'

    Args:
        path: 请求路径（如 '/api/user/'）

    Returns:
        模块名，若无法提取则返回 'unknown'
    """
    # 去除前后斜杠并分割
    parts = path.strip('/').split('/')
    # 如果分割后长度 >= 2，取第二段（索引1），否则未知
    if len(parts) >= 2:
        return parts[1]
    return "unknown"