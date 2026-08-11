"""
# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.

Django settings for spug project.
支持通过环境变量 / .env 文件覆盖配置，生产环境安全加固。
"""

import os
import re

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))
except ImportError:
    pass

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SPUG_ENV = os.getenv('SPUG_ENV', 'dev').lower()
IS_PROD = SPUG_ENV == 'prod'

SECRET_KEY = os.getenv('SECRET_KEY', "vk0do47)egwzz!uk49%(y3s(fpx4+ha@ugt-hcv&%&d@hwr&p7")

DEBUG = os.getenv('DEBUG', 'true' if not IS_PROD else 'false').lower() == 'true'

_allowed_hosts_raw = os.getenv('ALLOWED_HOSTS', '*')
ALLOWED_HOSTS = [h.strip() for h in _allowed_hosts_raw.split(',') if h.strip()]

INSTALLED_APPS = [
    "apps.account",
    "apps.host",
    "apps.setting",
    "apps.exec",
    "apps.schedule",
    "apps.monitor",
    "apps.alarm",
    "apps.config",
    "apps.app",
    "apps.deploy",
    "apps.notify",
    "apps.repository",
    "apps.home",
    "apps.database",
    "apps.playbook",
    "apps.ansible",
    "channels",
]

DEFAULT_AUTO_FIELD = "django.db.models.AutoField"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "libs.middleware.AuthenticationMiddleware",
    "libs.middleware.HandleExceptionMiddleware",
    "libs.middleware.OperationLogMiddleware",
]

ROOT_URLCONF = "spug.urls"
WSGI_APPLICATION = "spug.wsgi.application"
ASGI_APPLICATION = "spug.routing.application"

# Database
_db_engine = os.getenv('DB_ENGINE', 'sqlite').lower()
if _db_engine == 'sqlite':
    DATABASES = {
        "default": {
            "ATOMIC_REQUESTS": True,
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": os.getenv('DB_NAME') or os.path.join(BASE_DIR, "db.sqlite3"),
        }
    }
elif _db_engine == 'postgresql':
    DATABASES = {
        "default": {
            "ATOMIC_REQUESTS": True,
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv('DB_NAME', 'spug'),
            "HOST": os.getenv('DB_HOST', '127.0.0.1'),
            "PORT": os.getenv('DB_PORT', '5432'),
            "USER": os.getenv('DB_USER', 'spug'),
            "PASSWORD": os.getenv('DB_PASSWORD', ''),
        }
    }
elif _db_engine == 'mysql':
    DATABASES = {
        "default": {
            "ATOMIC_REQUESTS": True,
            "ENGINE": "django.db.backends.mysql",
            "NAME": os.getenv('DB_NAME', 'spug'),
            "HOST": os.getenv('DB_HOST', '127.0.0.1'),
            "PORT": os.getenv('DB_PORT', '3306'),
            "USER": os.getenv('DB_USER', 'spug'),
            "PASSWORD": os.getenv('DB_PASSWORD', ''),
        }
    }
else:
    raise ValueError(f"Unsupported DB_ENGINE: {_db_engine}")

# Redis
_redis_host = os.getenv('REDIS_HOST', '127.0.0.1')
_redis_port = int(os.getenv('REDIS_PORT', '6379'))
_redis_db = int(os.getenv('REDIS_DB', '1'))
_redis_password = os.getenv('REDIS_PASSWORD', '')
_redis_location = f"redis://:{_redis_password}@{_redis_host}:{_redis_port}/{_redis_db}" if _redis_password else f"redis://{_redis_host}:{_redis_port}/{_redis_db}"

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": _redis_location,
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            "CONNECTION_POOL_KWARGS": {
                "max_connections": 100,
                "socket_timeout": 60,
                "socket_connect_timeout": 10,
                "retry_on_timeout": True,
            },
        },
    }
}

_channels_host = os.getenv('CHANNELS_REDIS_HOST', _redis_host)
_channels_port = int(os.getenv('CHANNELS_REDIS_PORT', str(_redis_port)))
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [(_channels_host, _channels_port)],
            "capacity": 1000,
            "expiry": 120,
        },
    }
}

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
    },
]

TOKEN_TTL = int(os.getenv('TOKEN_TTL', str(8 * 3600)))
SCHEDULE_KEY = "spug:schedule"
SCHEDULE_WORKER_KEY = "spug:schedule:worker"
MONITOR_KEY = "spug:monitor"
MONITOR_WORKER_KEY = "spug:monitor:worker"
EXEC_WORKER_KEY = "spug:exec:worker"
PLAYBOOK_WORKER_KEY = "spug:playbook:worker"
FACTS_WORKER_KEY = "spug:facts:worker"
REQUEST_KEY = "spug:request"
BUILD_KEY = "spug:build"
REPOS_DIR = os.path.join(os.path.dirname(os.path.dirname(BASE_DIR)), "repos")
BUILD_DIR = os.path.join(REPOS_DIR, "build")
TRANSFER_DIR = os.path.join(BASE_DIR, "storage", "transfer")

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Shanghai"
USE_I18N = True
USE_TZ = False

AUTHENTICATION_EXCLUDES = (
    "/account/login/",
    "/setting/basic/",
    re.compile("/apis/.*"),
)

SPUG_VERSION = "v3.5.0"

# ==============================
# Security Hardening (生产环境)
# ==============================
if IS_PROD:
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_BROWSER_XSS_FILTER = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    X_FRAME_OPTIONS = 'DENY'

    if DEBUG:
        raise RuntimeError("DEBUG must be False in production (SPUG_ENV=prod)")

# ==============================
# Rate Limit 配置
# ==============================
RATE_LIMIT_LOGIN = os.getenv('RATE_LIMIT_LOGIN', '5/m')
RATE_LIMIT_TEST = os.getenv('RATE_LIMIT_TEST', '1/30s')
RATE_LIMIT_API = os.getenv('RATE_LIMIT_API', '100/m')

# override default config
try:
    from spug.overrides import *
except ImportError:
    pass
