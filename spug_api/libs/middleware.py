# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.utils.deprecation import MiddlewareMixin
from django.conf import settings
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
    操作日志中间件（优化版）
    优化点：
    1. 性能：将 2 次 DB 写入合并为 1 次，大幅降低数据库 I/O 压力。
    2. 安全：增加敏感字段脱敏，防止密码/Token 泄露。
    3. 健壮：安全读取响应体，防止大文件或流式响应导致 OOM。
    4. 严谨：使用正则匹配忽略 URL，避免前缀匹配误杀。
    5. 可观测：恢复异常日志记录，不再静默吞没错误。
    """

    # 1. 使用正则表达式精确匹配，避免 startswith 导致的误杀 (如 /api/login_test)
    IGNORE_URL_PATTERNS = [
        re.compile(r"^/api/login/?$"),
        re.compile(r"^/api/logout/?$"),
        re.compile(r"^/static/"),
        re.compile(r"^/media/"),
    ]

    # 敏感字段黑名单（小写），命中后将被替换为 ******
    SENSITIVE_KEYS = {
        'password', 'pwd', 'token', 'access_token', 'refresh_token', 
        'secret', 'id_card', 'bank_card', 'credit_card', 'captcha'
    }
    
    # 限制记录的最大响应体大小 (2KB)，防止大列表/大文件撑爆内存
    MAX_RESPONSE_LOG_SIZE = 2048 

    def process_request(self, request: HttpRequest) -> None:
        """请求预处理：记录开始时间，收集基础数据（不写库，减少 I/O）"""
        request._start_time = time.perf_counter()
        
        if not self._should_record(request):
            return

        # 将日志数据暂存到 request 对象中，延迟到响应时一次性写入
        request._log_data = {
            'username': self._get_username(request),
            'method': request.method,
            'url': request.path,
            'uri': request.get_full_path(),
            'module': get_module(request.path),
            'client_ip': get_request_real_ip(request.headers),
            'user_agent': request.META.get('HTTP_USER_AGENT', ''),
            'request_params': self._sanitize_data(get_request_params(request)),
        }
        logger.info(f"OperationLogMiddleware: {request.method} {request.path}")

    def process_response(self, request: HttpRequest, response: HttpResponse) -> HttpResponse:
        """正常响应：更新状态并一次性写入数据库"""
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
        
        self._save_log(log_data)
        return response

    def process_exception(self, request: HttpRequest, exception: Exception) -> Optional[HttpResponse]:
        """异常处理：记录错误信息并写入数据库"""
        log_data = getattr(request, '_log_data', None)
        if not log_data:
            return None

        start_time = getattr(request, '_start_time', time.perf_counter())
        cost_ms = int((time.perf_counter() - start_time) * 1000)
        
        log_data.update({
            'cost_time': cost_ms,
            'status': 'failed',
            'error_message': str(exception)[:500], # 限制错误信息长度，防止超长堆栈撑爆字段
        })
        
        self._save_log(log_data)
        return None  # 返回 None 让 Django 继续处理 500 异常

    # ================= 私有辅助方法 =================

    def _should_record(self, request: HttpRequest) -> bool:
        """判断当前请求是否需要记录日志（使用正则匹配）"""
        return not any(pattern.match(request.path) for pattern in self.IGNORE_URL_PATTERNS)

    def _get_username(self, request: HttpRequest) -> str:
        """安全获取用户名，完美兼容 AnonymousUser"""
        user = getattr(request, 'user', None)
        # 判断 user 存在且已认证
        if user and getattr(user, 'is_active', False):
            return getattr(user, 'username', 'unknown')
        return 'anonymous'

    def _sanitize_data(self, data, depth=0):
        """数据脱敏：递归清洗字典/列表中的敏感字段"""
        if depth > 3:  # 限制递归深度，防止恶意构造的深层 JSON 导致 CPU 飙升
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
        """安全读取响应体，防止 OOM 和流式响应崩溃"""
        # 1. 拦截流式响应（如文件下载），强行读取 content 会报错
        if isinstance(response, StreamingHttpResponse):
            return "[Streaming Response - Ignored]"

        content_type = response.get('Content-Type', '')
        # 2. 仅记录 JSON 格式，且限制大小
        if 'application/json' in content_type and response.content:
            if len(response.content) > self.MAX_RESPONSE_LOG_SIZE:
                return f"[Response too large: {len(response.content)} bytes]"
            
            try:
                data = json.loads(response.content)
                # 对响应数据也进行脱敏
                return self._sanitize_data(data)
            except json.JSONDecodeError:
                return response.content[:self.MAX_RESPONSE_LOG_SIZE].decode('utf-8', errors='ignore')
        return None

    def _save_log(self, log_data: dict) -> None:
        """统一执行数据库写入，并捕获异常记录日志"""
        try:
            # 优化：将原来的 create + save 两次 I/O 合并为一次 create
            OperationLog.objects.create(**log_data)
        except Exception as e:
            # 恢复日志记录，避免静默失败导致排查困难
            logger.error(f"Failed to save operation log: {e}", exc_info=False)