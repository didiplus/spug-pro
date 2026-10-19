# ── Stage 1: 构建前端 ──
FROM node:18-slim AS frontend-builder
WORKDIR /build
COPY spug_web/package.json spug_web/package-lock.json ./
RUN npm install --legacy-peer-deps
COPY spug_web/ ./
RUN NODE_OPTIONS=--openssl-legacy-provider GENERATE_SOURCEMAP=false npx react-app-rewired build

# ── Stage 2: 运行时 ──
FROM python:3.12-slim

LABEL org.opencontainers.image.title="Spug Pro" \
      org.opencontainers.image.description="轻量级无 Agent 自动化运维平台" \
      org.opencontainers.image.version="4.0.0" \
      org.opencontainers.image.license="AGPL-3.0" \
      org.opencontainers.image.source="https://github.com/openspug/spug"

ENV TZ=Asia/Shanghai \
    SPUG_ENV=prod \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx redis-server supervisor \
    default-libmysqlclient-dev build-essential pkg-config \
    libldap2-dev libsasl2-dev \
    git sshpass rsync curl \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/redis-server /usr/local/bin/redis-server

# Python 依赖
COPY spug_api/requirements.txt /tmp/requirements.txt
RUN pip install -r /tmp/requirements.txt \
    && pip install gunicorn mysqlclient psycopg2-binary

# Ansible（可选但推荐）
RUN pip install ansible ansible-runner || true

# 后端代码
COPY spug_api/ /data/spug/spug_api/
WORKDIR /data/spug/spug_api

# 前端构建产物
COPY --from=frontend-builder /build/build/ /data/spug/spug_web/build/

# 存储目录
RUN mkdir -p /data/spug/storage/transfer \
             /data/spug/storage/ssh_sessions \
             /data/spug/storage/roles \
             /data/spug/storage/pipeline_uploads \
             /data/repos /data/spug/spug_api/logs /data/spug/spug_api/pids

# 配置文件
COPY docs/docker/nginx.conf /etc/nginx/nginx.conf
COPY docs/docker/redis.conf /etc/redis/redis.conf
COPY docs/docker/spug.ini /etc/supervisor/conf.d/spug.conf
COPY docs/docker/ssh_config /etc/ssh/ssh_config
COPY docs/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /data/spug/spug_api/tools/*.sh

VOLUME ["/data/spug/storage", "/data/repos"]
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -sf http://localhost/api/setting/basic/ || exit 1

ENTRYPOINT ["/entrypoint.sh"]
