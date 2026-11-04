# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Released under the AGPL-3.0 License.
"""
SSH 连接池，基于 host_id 缓存已认证的 SSHClient 实例。

特性：
  - 空闲 TTL 过期（默认 5 分钟）
  - 最大连接数限制（默认 32）
  - 线程安全（threading.Lock）
  - 后台清理线程定期回收空闲连接
"""
import threading
import time
import logging
from paramiko.client import SSHClient, AutoAddPolicy
from .ssh import _load_pkey

logger = logging.getLogger(__name__)

_DEFAULT_TTL = 300
_DEFAULT_MAX = 32
_CLEANUP_INTERVAL = 60


class _PoolEntry:
    __slots__ = ('client', 'last_used', 'lock')

    def __init__(self, client):
        self.client = client
        self.last_used = time.time()
        self.lock = threading.Lock()


class SSHPool:
    def __init__(self, max_connections=_DEFAULT_MAX, ttl=_DEFAULT_TTL):
        self._pool = {}
        self._lock = threading.Lock()
        self._max = max_connections
        self._ttl = ttl
        self._stop = False
        self._cleaner = threading.Thread(target=self._cleanup_loop, daemon=True)
        self._cleaner.start()

    def get(self, host_id, hostname, port=22, username='root', pkey=None, password=None, timeout=10):
        key = host_id
        now = time.time()
        with self._lock:
            entry = self._pool.get(key)
            if entry and now - entry.last_used < self._ttl:
                entry.last_used = now
                return entry
            if entry:
                self._safe_close(entry)
                del self._pool[key]
            if len(self._pool) >= self._max:
                self._evict_oldest()
        client = SSHClient()
        client.set_missing_host_key_policy(AutoAddPolicy)
        client.connect(
            hostname=hostname, port=port, username=username,
            pkey=_load_pkey(pkey), password=password,
            timeout=timeout, allow_agent=False, look_for_keys=False,
            banner_timeout=30,
        )
        transport = client.get_transport()
        if transport:
            transport.set_keepalive(30)
        with self._lock:
            entry = _PoolEntry(client)
            self._pool[key] = entry
        return entry

    def release(self, host_id):
        with self._lock:
            entry = self._pool.get(host_id)
            if entry:
                entry.last_used = time.time()

    def close(self, host_id):
        with self._lock:
            entry = self._pool.pop(host_id, None)
        if entry:
            self._safe_close(entry)

    def shutdown(self):
        self._stop = True
        with self._lock:
            for key in list(self._pool.keys()):
                entry = self._pool.pop(key, None)
                if entry:
                    self._safe_close(entry)

    def _evict_oldest(self):
        oldest_key = min(self._pool, key=lambda k: self._pool[k].last_used)
        entry = self._pool.pop(oldest_key, None)
        if entry:
            self._safe_close(entry)

    def _cleanup_loop(self):
        while not self._stop:
            time.sleep(_CLEANUP_INTERVAL)
            now = time.time()
            with self._lock:
                for key in list(self._pool.keys()):
                    entry = self._pool.get(key)
                    if entry and now - entry.last_used > self._ttl:
                        del self._pool[key]
                        self._safe_close(entry)

    @staticmethod
    def _safe_close(entry):
        try:
            if entry.client:
                entry.client.close()
        except Exception:
            pass


ssh_pool = SSHPool()