"""公共工具：装饰器、格式化、常量"""
import os
import time
from functools import wraps

BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), 'backups')
os.makedirs(BACKUP_DIR, exist_ok=True)


def timed_test(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        try:
            version = func(*args, **kwargs)
            latency_ms = int((time.perf_counter() - start) * 1000)
            return {"success": True, "version": version, "latency": latency_ms}
        except Exception as e:
            return {"success": False, "message": str(e)}
    return wrapper


def format_uptime(seconds):
    s = int(seconds or 0)
    d, s = divmod(s, 86400)
    h, s = divmod(s, 3600)
    m, _ = divmod(s, 60)
    if d > 0:
        return f"{d}天{h}小时"
    if h > 0:
        return f"{h}小时{m}分"
    return f"{m}分钟"