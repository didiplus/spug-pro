#!/bin/bash
set -e

# 生成 SECRET_KEY（如果未提供）
if [ -z "$SECRET_KEY" ]; then
    SECRET_KEY=$(python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")
    echo "[entrypoint] 自动生成 SECRET_KEY"
fi

# 从 MYSQL_* 环境变量映射到 DB_* 配置
DB_ENGINE="${DB_ENGINE:-mysql}"
DB_NAME="${DB_NAME:-${MYSQL_DATABASE:-spug}}"
DB_USER="${DB_USER:-${MYSQL_USER:-spug}}"
DB_PASSWORD="${DB_PASSWORD:-${MYSQL_PASSWORD:-}}"
DB_HOST="${DB_HOST:-${MYSQL_HOST:-127.0.0.1}}"
DB_PORT="${DB_PORT:-${MYSQL_PORT:-3306}}"

# 写入 .env
cat > /data/spug/spug_api/.env << EOF
SPUG_ENV=prod
SECRET_KEY=${SECRET_KEY}
DEBUG=false
ALLOWED_HOSTS=*
DB_ENGINE=${DB_ENGINE}
DB_NAME=${DB_NAME}
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=1
TOKEN_TTL=28800
EOF

# 等待数据库就绪
if [ "$DB_ENGINE" != "sqlite" ]; then
    echo "[entrypoint] 等待数据库 ${DB_HOST}:${DB_PORT} ..."
    for i in $(seq 1 30); do
        if python3 -c "
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(1)
try:
    s.connect(('${DB_HOST}', ${DB_PORT}))
    s.close()
except:
    sys.exit(1)
" 2>/dev/null; then
            echo "[entrypoint] 数据库已就绪"
            break
        fi
        echo "  等待中... ($i/30)"
        sleep 1
    done
fi

# 初始化数据库（首次启动）
if [ ! -f /data/spug/.initialized ]; then
    echo "[entrypoint] 初始化数据库..."
    cd /data/spug/spug_api
    python3 manage.py updatedb
    if [ -n "$SPUG_ADMIN_USER" ] && [ -n "$SPUG_ADMIN_PASS" ]; then
        python3 manage.py useradd -u "$SPUG_ADMIN_USER" -p "$SPUG_ADMIN_PASS" -s -n 管理员
        echo "[entrypoint] 管理员账户已创建: $SPUG_ADMIN_USER"
    fi
    touch /data/spug/.initialized
    echo "[entrypoint] 初始化完成"
fi

echo "[entrypoint] 启动 supervisord..."
exec supervisord -c /etc/supervisor/conf.d/spug.conf
