# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
"""
基于 Redis 令牌桶的 API 限流装饰器。

用法:
    from libs.ratelimit import rate_limit

    @rate_limit(rate='5/m', key_func=by_ip)
    def login(request): ...

    @rate_limit(rate='1/30s', key_func=by_user)
    def handle_test(request): ...

rate 格式: "<次数>/<时间窗口>"，如 "10/m" (每分钟10次)、"1/30s" (每30秒1次)、"100/h" (每小时100次)
"""
from functools import wraps
from django.core.cache import cache
from .utils import json_response, get_request_real_ip
import time
import re

_RATE_PATTERN = re.compile(r'^(\d+)/(?:(\d+))?([smh])$')
_UNIT_SECONDS = {'s': 1, 'm': 60, 'h': 3600}

def _parse_rate(rate):
    match = _RATE_PATTERN.match(rate)
    if not match:
        raise ValueError(f"Invalid rate format: {rate!r}, expected like '10/m', '1/30s', '100/h'")
    count = int(match.group(1))
    window_num = int(match.group(2)) if match.group(2) else 1
    window = window_num * _UNIT_SECONDS[match.group(3)]
    return count, window


def by_ip(request):
    """按客户端 IP 限流"""
    return f"rl:ip:{get_request_real_ip(request.headers)}"


def by_user(request):
    """按当前登录用户限流"""
    user = getattr(request, 'user', None)
    if user and getattr(user, 'id', None):
        return f"rl:user:{user.id}"
    return by_ip(request)


def by_token(request):
    """按请求 token 限流（用于开放 API）"""
    token = request.headers.get('x-token') or request.GET.get('x-token') or ''
    if token:
        return f"rl:token:{token}"
    return by_ip(request)


def rate_limit(rate='10/m', key_func=None, burst=None):
    """
    令牌桶限流装饰器。

    :param rate: 限流速率，如 '5/m'、'1/30s'、'100/h'
    :param key_func: 限流 key 提取函数，默认 by_ip
    :param burst: 突发容量，默认等于 rate 的次数
    """
    count, window = _parse_rate(rate)
    capacity = burst if burst is not None else count
    refill_rate = count / window

    def decorator(view_func):
        @wraps(view_func)
        def wrapper(*args, **kwargs):
            request = args[0] if args else kwargs.get('request')
            if request is None:
                return view_func(*args, **kwargs)

            get_key = key_func or by_ip
            cache_key = get_key(request)

            allowed = _token_bucket_allow(cache_key, capacity, refill_rate)
            if not allowed:
                response = json_response(error='请求过于频繁，请稍后再试')
                response.status_code = 429
                response['Retry-After'] = str(int(window / count))
                return response

            return view_func(*args, **kwargs)

        return wrapper

    return decorator


def _token_bucket_allow(key, capacity, refill_rate):
    """
    令牌桶算法 (基于 Redis INCR + 过期时间实现)。
    使用简化版: 固定窗口计数器，性能好且足够可靠。

    :param key: 缓存 key
    :param capacity: 窗口内最大允许次数
    :param refill_rate: 每秒补充的令牌数 (用于计算窗口大小)
    :return: True 允许, False 拒绝
    """
    window = int(capacity / refill_rate) if refill_rate > 0 else 1
    window_key = f"{key}:w{int(time.time() // window)}"

    try:
        current = cache.incr(window_key)
        if current == 1:
            cache.expire(window_key, window + 1)
        return current <= capacity
    except Exception:
        return True