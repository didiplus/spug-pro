from django_redis import get_redis_connection
from django.db import connections
from django.conf import settings
from apps.account.models import OperationLog
import json
import time
import logging

logger = logging.getLogger(__name__)

BATCH_SIZE = 100
FLUSH_INTERVAL = 5
QUEUE_KEY = settings.OPERATION_LOG_WORKER_KEY


def oplog_consumer():
    """操作日志批量消费者，在独立线程中运行

    从 Redis 队列消费日志数据，累积到 BATCH_SIZE 条或 FLUSH_INTERVAL 秒后
    使用 bulk_create 批量写入数据库，大幅降低 DB I/O 压力。
    """
    rds = get_redis_connection()
    buffer = []
    last_flush = time.time()

    while True:
        try:
            result = rds.blpop(QUEUE_KEY, timeout=1)
            if result:
                _, job = result
                try:
                    buffer.append(json.loads(job))
                except (json.JSONDecodeError, TypeError) as e:
                    logger.warning(f"oplog invalid data: {e}")

            now = time.time()
            if len(buffer) >= BATCH_SIZE or (buffer and now - last_flush >= FLUSH_INTERVAL):
                _flush(buffer)
                buffer = []
                last_flush = now

        except Exception as e:
            logger.error(f"oplog consumer error: {e}")
            time.sleep(1)
            try:
                rds = get_redis_connection()
            except Exception:
                pass


def _flush(buffer):
    """批量写入日志到数据库"""
    if not buffer:
        return
    try:
        logs = [OperationLog(**data) for data in buffer]
        OperationLog.objects.bulk_create(logs, batch_size=BATCH_SIZE)
        logger.info(f"oplog flushed {len(logs)} records")
    except Exception as e:
        logger.error(f"oplog flush failed: {e}")
    finally:
        try:
            connections.close_all()
        except Exception:
            pass