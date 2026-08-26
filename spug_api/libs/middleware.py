# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.utils.deprecation import MiddlewareMixin
from django.conf import settings
from django_redis import get_redis_connection
from .utils import json_response, get_request_real_ip
from apps.account.utils import get_request_params,get_module
from apps.account.models import User,OperationLog
from apps.setting.utils import AppSetting
import traceback
import time,json,logging,re
from typing import Optional
from django.http import HttpRequest, HttpResponse,StreamingHttpResponse


# 配置独立的 logger，避免与业务日志混淆
logger = logging.getLogger(__name__)


class HandleExceptionMiddleware(MiddlewareMixin):
    """
    处理试图函数异常
    """

    def process_exception(self, request, exception):
        traceback.print_exc()
        return json_response(error='Exception: %s' % exception)


class AuthenticationMiddleware(MiddlewareMixin):
    """
    登录验证
    """

    def process_request(self, request):
        if request.path in settings.AUTHENTICATION_EXCLUDES:
            return None
        if any(x.match(request.path) for x in settings.AUTHENTICATION_EXCLUDES if hasattr(x, 'match')):
            return None
        access_token = request.headers.get('x-token') or request.GET.get('x-token')
        if access_token and len(access_token) == 32:
            x_real_ip = get_request_real_ip(request.headers)
            user = User.objects.filter(access_token=access_token).first()
            if user and user.token_expired >= time.time() and user.is_active:
                if x_real_ip == user.last_ip or AppSetting.get_default('bind_ip') is False:
                    request.user = user
                    user.token_expired = time.time() + settings.TOKEN_TTL
                    user.save()
                    return None
        response = json_response(error="验证失败，请重新登录")
        response.status_code = 401
        return response









class OperationLogMiddleware(MiddlewareMixin):
    """
    操作日志中间件（异步队列版）
    改进点：
    1. 异步写入：推入 Redis 队列，不阻塞响应，由后台 Worker 批量消费。
    2. 只记录写操作：默认仅 POST/PUT/PATCH/DELETE，GET 请求不记录。
    3. 修复重复写入：process_exception 写入后清除 _log_data。
    4. 修复序列化：response_data/request_params 正确 json.dumps。
    5. 安全：敏感字段脱敏，防止密码/Token 泄露。
    6. 健壮：安全读取响应体，防止大文件或流式响应导致 OOM。
    """

    IGNORE_URL_PATTERNS = [
        re.compile(r"^/api/login/?$"),
        re.compile(r"^/api/logout/?$"),
        re.compile(r"^/static/"),
        re.compile(r"^/media/"),
    ]

    RECORD_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}

    SENSITIVE_KEYS = {
        'password', 'pwd', 'token', 'access_token', 'refresh_token','access_key','secret_key',
        'secret', 'id_card', 'bank_card', 'credit_card', 'captcha'
    }

    MAX_RESPONSE_LOG_SIZE = 2048

    def process_request(self, request: HttpRequest) -> None:
        request._start_time = time.perf_counter()

        if not self._should_record(request):
            return

        request._log_data = {
            'username': self._get_username(request),
            'method': request.method,
            'url': request.path,
            'uri': request.get_full_path(),
            'module': get_module(request.path),
            'client_ip': get_request_real_ip(request.headers),
            'user_agent': request.META.get('HTTP_USER_AGENT', ''),
            'request_params': json.dumps(
                self._sanitize_data(get_request_params(request)),
                ensure_ascii=False, default=str
            ),
        }

    def process_response(self, request: HttpRequest, response: HttpResponse) -> HttpResponse:
        log_data = getattr(request, '_log_data', None)
        if not log_data:
            return response

        start_time = getattr(request, '_start_time', time.perf_counter())
        cost_ms = int((time.perf_counter() - start_time) * 1000)

        status = 'success' if response.status_code < 400 else 'failed'
        log_data.update({
            'cost_time': cost_ms,
            'response_status': response.status_code,
            'response_data': self._get_response_data(response),
            'status': status,
        })

        self._enqueue_log(log_data)
        del request._log_data
        return response

    def process_exception(self, request: HttpRequest, exception: Exception) -> Optional[HttpResponse]:
        log_data = getattr(request, '_log_data', None)
        if not log_data:
            return None

        start_time = getattr(request, '_start_time', time.perf_counter())
        cost_ms = int((time.perf_counter() - start_time) * 1000)

        log_data.update({
            'cost_time': cost_ms,
            'status': 'failed',
            'error_message': str(exception)[:500],
        })

        self._enqueue_log(log_data)
        del request._log_data
        return None

    # ================= 私有辅助方法 =================

    def _should_record(self, request: HttpRequest) -> bool:
        if request.method not in self.RECORD_METHODS:
            return False
        return not any(pattern.match(request.path) for pattern in self.IGNORE_URL_PATTERNS)

    def _get_username(self, request: HttpRequest) -> str:
        user = getattr(request, 'user', None)
        if user and getattr(user, 'is_active', False):
            return getattr(user, 'username', 'unknown')
        return 'anonymous'

    def _sanitize_data(self, data, depth=0):
        if depth > 3:
            return str(data)

        if isinstance(data, dict):
            return {
                k: ('******' if k.lower() in self.SENSITIVE_KEYS else self._sanitize_data(v, depth + 1))
                for k, v in data.items()
            }
        elif isinstance(data, list):
            return [self._sanitize_data(item, depth + 1) for item in data]
        return data

    def _get_response_data(self, response: HttpResponse) -> Optional[str]:
        if isinstance(response, StreamingHttpResponse):
            return "[Streaming Response - Ignored]"

        content_type = response.get('Content-Type', '')
        if 'application/json' in content_type and response.content:
            if len(response.content) > self.MAX_RESPONSE_LOG_SIZE:
                return f"[Response too large: {len(response.content)} bytes]"

            try:
                data = json.loads(response.content)
                return json.dumps(
                    self._sanitize_data(data),
                    ensure_ascii=False, default=str
                )
            except json.JSONDecodeError:
                return response.content[:self.MAX_RESPONSE_LOG_SIZE].decode('utf-8', errors='ignore')
        return None

    def _enqueue_log(self, log_data: dict) -> None:
        try:
            rds = get_redis_connection()
            rds.rpush(settings.OPERATION_LOG_WORKER_KEY, json.dumps(log_data, default=str))
        except Exception as e:
            logger.error(f"Failed to enqueue operation log: {e}", exc_info=False)