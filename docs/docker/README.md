# Spug Docker 部署指南

Spug 提供两种 Docker 部署模式，按需选择：

| 模式 | Compose 文件 | 适用场景 |
|------|-------------|---------|
| **全内置模式** | `docker-compose.yml` | 快速体验 / 单机部署，DB 和 Redis 由容器自带 |
| **外部服务模式** | `docker-compose.external.yml` | 生产环境，使用外部已有的 MySQL/PostgreSQL 和 Redis |

---

## 一、全内置模式

容器内自带 MariaDB + Redis + Nginx + Spug 全部组件，一条命令拉起完整服务。

### 1. 准备配置

```bash
cd docs/docker
cp .env.example .env
```

编辑 `.env`，至少设置数据库密码：

```ini
# 数据库密码（必填）
MYSQL_PASSWORD=spug.dev
MYSQL_ROOT_PASSWORD=spug.dev

# 管理员账户（首次启动自动创建）
SPUG_ADMIN_USER=admin
SPUG_ADMIN_PASS=spug.dev
```

### 2. 构建并启动

```bash
docker compose up -d --build
```

启动后会创建两个容器：

- `spug-db` — MariaDB 10.11
- `spug` — Spug 主服务（Nginx + API + WS + Worker + Scheduler + Monitor + Redis）

### 3. 访问

浏览器打开 `http://<服务器IP>`，使用 `.env` 中设置的管理员账户登录。

### 4. 数据持久化

| 宿主机路径 | 容器路径 | 说明 |
|-----------|---------|------|
| `/data/spug/mysql` | `/var/lib/mysql` | MariaDB 数据 |
| `/data/spug/storage` | `/data/spug/storage` | Spug 存储（传输文件、SSH 会话等） |
| `/data/repos` | `/data/repos` | Git 仓库 |

### 5. 常用命令

```bash
# 查看日志
docker compose logs -f spug

# 重启服务
docker compose restart spug

# 停止并清理
docker compose down

# 升级（重新构建镜像）
docker compose up -d --build
```

---

## 二、外部服务模式

使用外部已有的数据库和 Redis，容器更轻量，仅运行 Nginx + Spug 应用进程。适合生产环境与现有基础设施集成。

### 1. 前置条件

- 外部数据库已就绪（MySQL 5.7+ / MariaDB 10.3+ / PostgreSQL 12+）
- 外部 Redis 已就绪（Redis 5+）
- 数据库中已创建 Spug 库和用户

**MySQL 建库示例：**

```sql
CREATE DATABASE spug DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'spug'@'%' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON spug.* TO 'spug'@'%';
FLUSH PRIVILEGES;
```

### 2. 准备配置

```bash
cd docs/docker
cp .env.external.example .env
```

编辑 `.env`，填入外部数据库和 Redis 连接信息：

```ini
# 外部数据库（必填）
DB_ENGINE=mysql              # mysql 或 postgresql
DB_HOST=192.168.1.100
DB_PORT=3306
DB_NAME=spug
DB_USER=spug
DB_PASSWORD=your_db_password

# 外部 Redis（必填）
REDIS_HOST=192.168.1.101
REDIS_PORT=6379
REDIS_DB=1
REDIS_PASSWORD=your_redis_password

# 管理员账户（首次启动自动创建）
SPUG_ADMIN_USER=admin
SPUG_ADMIN_PASS=spug.dev
```

### 3. 构建并启动

```bash
docker compose -f docker-compose.external.yml up -d --build
```

仅创建一个容器 `spug`，启动前会自动检测外部 DB 和 Redis 的连通性。

### 4. 访问

浏览器打开 `http://<服务器IP>`，使用管理员账户登录。

### 5. 数据持久化

| 宿主机路径 | 容器路径 | 说明 |
|-----------|---------|------|
| `/data/spug/storage` | `/data/spug/storage` | Spug 存储 |
| `/data/repos` | `/data/repos` | Git 仓库 |

> 数据库和 Redis 数据由外部服务自行管理，不在本容器持久化。

### 6. 常用命令

```bash
# 查看日志
docker compose -f docker-compose.external.yml logs -f spug

# 重启
docker compose -f docker-compose.external.yml restart spug

# 停止
docker compose -f docker-compose.external.yml down
```

---

## 三、环境变量参考

### 通用变量

| 变量 | 默认值 | 说明 |
|------|-------|------|
| `SPUG_ADMIN_USER` | `admin` | 管理员用户名（首次启动创建） |
| `SPUG_ADMIN_PASS` | `spug.dev` | 管理员密码 |
| `SECRET_KEY` | 自动生成 | Django SECRET_KEY，建议固定设置 |
| `SECURE_SSL` | `false` | 设为 `true` 启用 HTTPS 重定向 |

### 数据库变量

| 变量 | 全内置模式 | 外部模式 | 说明 |
|------|-----------|---------|------|
| `DB_ENGINE` | `mysql` | `mysql` | `mysql` 或 `postgresql` |
| `DB_HOST` | `db`（容器内） | **必填** | 数据库地址 |
| `DB_PORT` | `3306` | `3306` | 数据库端口 |
| `DB_NAME` | `spug` | `spug` | 数据库名 |
| `DB_USER` | `spug` | **必填** | 数据库用户 |
| `DB_PASSWORD` | 来自 `MYSQL_PASSWORD` | **必填** | 数据库密码 |

> 全内置模式兼容 `MYSQL_*` 变量，外部模式推荐使用 `DB_*` 变量。

### Redis 变量

| 变量 | 全内置模式 | 外部模式 | 说明 |
|------|-----------|---------|------|
| `REDIS_HOST` | `127.0.0.1`（容器内） | **必填** | Redis 地址 |
| `REDIS_PORT` | `6379` | `6379` | Redis 端口 |
| `REDIS_DB` | `1` | `1` | Redis DB 编号 |
| `REDIS_PASSWORD` | 空 | 可填 | Redis 密码 |
| `CHANNELS_REDIS_HOST` | 回退到 `REDIS_HOST` | 回退到 `REDIS_HOST` | WebSocket 专用 Redis |
| `CHANNELS_REDIS_PORT` | 回退到 `REDIS_PORT` | 回退到 `REDIS_PORT` | WebSocket Redis 端口 |
| `CHANNELS_REDIS_PASSWORD` | 回退到 `REDIS_PASSWORD` | 回退到 `REDIS_PASSWORD` | WebSocket Redis 密码 |

---

## 四、模式对比

| 维度 | 全内置模式 | 外部服务模式 |
|------|-----------|------------|
| 容器数量 | 2（spug + db） | 1（spug） |
| 镜像体积 | 较大（含 Redis） | 较小 |
| 数据库 | 容器自带 MariaDB | 外部 MySQL/PostgreSQL |
| Redis | 容器自带 | 外部 |
| 高可用 | 单机 | 可对接集群 |
| 备份 | 需分别备份容器卷 | DB/Redis 由外部基础设施统一备份 |
| 适用场景 | 开发/测试/小规模 | 生产环境 |

---

## 五、从全内置模式迁移到外部模式

1. **导出数据库：**

```bash
docker exec spug-db mysqldump -u root -p spug > spug_backup.sql
```

2. **导入到外部数据库：**

```bash
mysql -h <外部DB地址> -u spug -p spug < spug_backup.sql
```

3. **切换 compose 文件启动：**

```bash
docker compose down                          # 停止旧容器
cp .env.external.example .env               # 切换配置
# 编辑 .env 填入外部 DB/Redis 地址
docker compose -f docker-compose.external.yml up -d --build
```

4. **迁移存储目录**（如需更换宿主机）：

```bash
rsync -avz /data/spug/storage/ <新宿主机>:/data/spug/storage/
rsync -avz /data/repos/ <新宿主机>:/data/repos/
```