<div align="center">

# Spug Pro

**基于开源项目 [Spug](https://github.com/openspug/spug) 二次开发 · 面向中小企业的轻量级无 Agent 自动化运维平台**

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0) [![Python](https://img.shields.io/badge/python-%E2%89%A5%203.12-3776AB.svg)](https://www.python.org/) [![Django](https://img.shields.io/badge/django-4.2-092E20.svg)](https://www.djangoproject.com/) [![React](https://img.shields.io/badge/react-16-61DAFB.svg)](https://react.dev/) [![Ant Design](https://img.shields.io/badge/Ant%20Design-5-1677FF.svg)](https://ant.design/) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)]()

**✨ Ansible 自动化 · CI/CD 流水线编排 · 数据库管理与备份 · 监控报警中心 · 字段级加密 · 深色模式**

</div>



> 本项目 fork 自开源运维平台 [Spug](https://github.com/openspug/spug)，在其基础上进行二次开发与功能扩展。
> 继承原项目「无 Agent、基于 SSH 协议」的轻量级理念，并新增 **Ansible 自动化**、**CI/CD 流水线可视化编排**、
> **数据库管理与备份**、**监控报警中心**、**字段级加密**、**深色模式** 等能力，形成覆盖主机管理、批量执行、
> 在线终端、应用发布、配置中心、数据库管理、Ansible 自动化、CI/CD 流水线编排、监控报警等场景的全栈运维平台。

---

## 目录

<details open>
<summary>点击展开 / 收起目录导航</summary>

- [Spug Pro](#spug-pro)
  - [目录](#目录)
  - [与原项目 Spug 的关系](#与原项目-spug-的关系)
  - [特性](#特性)
    - [核心运维](#核心运维)
    - [发布与配置](#发布与配置)
    - [CI/CD 流水线](#cicd-流水线)
    - [Ansible 自动化](#ansible-自动化)
    - [数据库管理](#数据库管理)
    - [监控与报警](#监控与报警)
    - [系统管理](#系统管理)
    - [平台特性](#平台特性)
  - [技术栈](#技术栈)
    - [后端 (`spug_api/`)](#后端-spug_api)
    - [前端 (`spug_web/`)](#前端-spug_web)
  - [项目结构](#项目结构)
  - [环境要求](#环境要求)
  - [快速开始](#快速开始)
    - [开发环境](#开发环境)
    - [Docker 部署](#docker-部署)
    - [一键安装（CentOS / Ubuntu）](#一键安装centos--ubuntu)
  - [环境变量](#环境变量)
  - [服务架构](#服务架构)
  - [常用管理命令](#常用管理命令)
  - [License](#license)

</details>

---

## 与原项目 Spug 的关系

| 维度 | 说明 |
|:----:|------|
| **上游** | [openspug/spug](https://github.com/openspug/spug) |
| **继承** | 无 Agent 架构、SSH 协议、主机管理、批量执行、应用发布、配置中心、账户权限体系、LDAP 集成 |
| **新增** | Ansible 全功能管理、CI/CD 流水线编排、数据库管理与备份、监控报警中心、字段级加密、深色模式令牌系统 |
| **技术栈升级** | Python ≥ 3.12、Django 4.2、Channels 4.1、Ant Design 5 |
| **License** | 沿用上游 AGPL-3.0 |

---

## 特性

### 核心运维

- **主机管理** — 集中管理主机信息，支持分组与标签

<div align="center">

![添加分组](./docs/images/spug_pro001.png)
![添加主机](./docs/images/spug_pro002.png)
![查看主机详情](./docs/images/spug_pro003.png)

</div>

- **批量执行** — 在线批量执行命令，支持模板化管理

<div align="center">

![批量执行页面](./docs/images/spug_pro020.png)
![批量执行结果返回页面](./docs/images/spug_pro019.png)

</div>

- **模板管理** — 在线创建命令模板，方便复用

<div align="center">

![模板管理列表页](./docs/images/spug_pro021.png)
![模板管理编辑页](./docs/images/spug_pro022.png)

</div>

- **在线终端** — 浏览器内 SSH 终端，基于 xterm.js 实时交互

<div align="center">

![在线终端](./docs/images/spug_pro024.png)

</div>

- **SSH 会话审计** — 记录所有通过平台进行的 SSH 操作，方便后续审计追踪

<div align="center">

![SSH会话审计-列表](./docs/images/spug_pro025.png)
![SSH会话审计-详情](./docs/images/spug_pro026.png)

</div>

- **文件管理** — 主机文件在线上传下载与远程管理

<div align="center">

![文件管理](./docs/images/spug_pro023.png)

</div>

- **文件分发** — 跨主机文件批量分发

<div align="center">

![文件分发](./docs/images/spug_pro027.png)

</div>

- **巡检任务** — 通过自定义巡检项，组装巡检任务，方便运维人员进行主机健康检查

<div align="center">

![巡检项列表](./docs/images/spug_pro028.png)
![添加巡检项](./docs/images/spug_pro029.png)
![添加巡检任务](./docs/images/spug_pro030.png)
![巡检任务列表](./docs/images/spug_pro031.png)
![查看巡检结果](./docs/images/spug_pro032.png)

</div>

### 发布与配置

- **应用发布** — 自定义发布部署流程，多环境多应用管理
- **构建仓库** — Git 仓库集成，在线触发构建与版本管理
- **发布申请** — 申请-审核-执行完整发布工作流
- **配置中心** — KV / 文本 / JSON 格式配置管理，多环境隔离

### CI/CD 流水线

- **可视化编排** — 节点图拖拽编辑，支持 8 种内置模块
- **模块** — SSH 执行 / 构建 / 参数注入 / 数据传输 / Webhook / Spug 发布
- **执行控制** — 拓扑排序分层并行，实时日志推送，执行历史回放

<div align="center">

![可视化编排](./docs/images/spug_pro048.png)
![历史回放-列表](./docs/images/spug_pro050.png)
![历史回放-详情](./docs/images/spug_pro049.png)

</div>

### Ansible 自动化

- **Playbook 管理** — 在线编辑 / 执行 / 版本历史 / 回滚 / Diff 对比

<div align="center">

![新增Playbook](./docs/images/spug_pro034.png)
![编辑Playbook](./docs/images/spug_pro033.png)
![执行Playbook](./docs/images/spug_pro037.png)
![返回结果](./docs/images/spug_pro038.png)
![版本历史](./docs/images/spug_pro035.png)
![Diff 对比](./docs/images/spug_pro039.png)

</div>

- **Inventory 管理** — 动态 Inventory，分组树 + 主机变量 + 组变量

<div align="center">

![Inventory 管理](./docs/images/spug_pro054.png)

</div>

- **Vault 加密** — 敏感数据加密管理，执行时自动解密注入

<div align="center">

![Vault 加密列表](./docs/images/spug_pro051.png)
![新建 Vault 加密](./docs/images/spug_pro052.png)
![查看 Vault 加密](./docs/images/spug_pro053.png)

</div>

- **Facts 采集** — 主机信息批量采集（并发），缓存与浏览

<div align="center">

![Facts 采集](./docs/images/spug_pro044.png)
![采集数据-列表](./docs/images/spug_pro046.png)
![采集数据-详情](./docs/images/spug_pro047.png)
![浏览采集数据](./docs/images/spug_pro045.png)

</div>

- **Module 浏览器** — Ansible 内置模块文档查阅

<div align="center">

![Module 浏览器](./docs/images/spug_pro041.png)

</div>

- **Role 市场** — Role 安装 / 部署 / 版本管理

<div align="center">

![Role 市场](./docs/images/spug_pro042.png)
![添加 Role](./docs/images/spug_pro040.png)
![部署 Role](./docs/images/spug_pro043.png)

</div>

### 数据库管理

- **多数据库支持** — MySQL / PostgreSQL / SQL Server / Oracle / MongoDB / Redis / ClickHouse 等

<div align="center">

![添加数据库](./docs/images/spug_pro005.png)
![数据库列表页面](./docs/images/spug_pro006.png)
![数据库详情页-概览](./docs/images/spug_pro007.png)
![数据库详情页-表](./docs/images/spug_pro008.png)

</div>

- **在线 SQL** — 数据库在线查询与执行，语法高亮

<div align="center">

![在线SQL](./docs/images/spug_pro013.png)

</div>

- **数据库备份** — 异步备份，保留策略（数量 / 时间 / GFS 旋转）

<div align="center">

![添加备份](./docs/images/spug_pro014.png)
![添加保留规则](./docs/images/spug_pro015.png)
![数据库备份列表](./docs/images/spug_pro016.png)

</div>

- **远程存储** — S3 / 阿里云 OSS / 腾讯云 COS / 华为云 OBS

<div align="center">

![添加对象存储](./docs/images/spug_pro017.png)

</div>

### 监控与报警

- **监控中心** — 站点 / 端口 / 进程 / 自定义脚本监控
- **报警中心** — 报警记录查询与统计
- **报警通知** — 短信 / 邮件 / 钉钉 / 微信
- **报警策略** — 灵活的报警规则与阈值配置

<div align="center">

![添加监控-站点](./docs/images/spug_pro056.png)
![添加监控-端口](./docs/images/spug_pro057.png)
![添加监控-进程](./docs/images/spug_pro058.png)
![报警策略](./docs/images/spug_pro059.png)
![监控中心](./docs/images/spug_pro067.png)

</div>

### 系统管理

- **账户管理** — 用户 / 部门 / 角色权限 / 菜单管理

<div align="center">

![账户管理](./docs/images/spug_pro060.png)
![新增用户](./docs/images/spug_pro061.png)
![新增角色](./docs/images/spug_pro063.png)
![角色权限](./docs/images/spug_pro064.png)
![发布权限](./docs/images/spug_pro065.png)
![主机权限](./docs/images/spug_pro066.png)

</div>

- **操作日志** — 异步记录，多维筛选

<div align="center">

![操作日志-列表](./docs/images/spug_pro068.png)
![操作日志-详情](./docs/images/spug_pro069.png)

</div>

- **任务计划** — 在线定时任务调度

<div align="center">

![任务计划](./docs/images/spug_pro070.png)

</div>

- **LDAP 集成** — 企业 LDAP 统一认证

<div align="center">

![LDAP 集成](./docs/images/spug_pro071.png)

</div>

### 平台特性

| 特性 | 说明 |
|------|------|
| **无 Agent** | 基于 SSH 协议，无需在被控端安装 Agent |
| **实时通信** | WebSocket 实时日志推送与终端交互 |
| **字段级加密** | Fernet 对称加密，敏感字段自动加解密 |
| **深色模式** | CSS 变量令牌系统，自动跟随系统主题 |
| **速率限制** | 登录 / API 请求速率限制 |
| **安全加固** | 生产环境 SSL / HSTS / X-Frame-Options 自动启用 |

---

## 技术栈

### 后端 (`spug_api/`)

| 依赖 | 版本 | 用途 |
|------|:----:|------|
| Python | ≥ 3.12 | 运行时 |
| Django | 4.2.16 | Web 框架 |
| Channels + Daphne | 4.1 / 4.1 | ASGI / WebSocket |
| django-redis | 5.2 | Redis 缓存 / 消息队列 |
| Paramiko | 3.4 | SSH 连接 |
| ansible-runner | ≥ 2.4 | Ansible 执行引擎（可选） |
| cryptography | ≥ 43 | Fernet 字段级加密 |
| GitPython | 3.1 | Git 仓库操作 |
| boto3 / oss2 | — | 云存储 SDK |
| python-ldap | 3.4 | LDAP 认证 |
| APScheduler | 3.10 | 定时任务调度 |

### 前端 (`spug_web/`)

| 依赖 | 版本 | 用途 |
|------|:----:|------|
| React | 16 | UI 框架 |
| Ant Design | 5 | 组件库 |
| MobX | 5 | 状态管理 |
| xterm.js | 4 | Web 终端 |
| Ace Editor | 9 | 代码编辑器 |
| BizCharts | 3 | 数据可视化 |

---

## 项目结构

```
spug-pro/
├── spug_api/                        # 后端
│   ├── apps/                        # 业务应用
│   │   ├── account/                 # 账户 / 角色 / 权限 / 操作日志
│   │   ├── alarm/                   # 报警中心
│   │   ├── ansible/                 # Ansible 全功能管理
│   │   ├── apis/                    # 开放 API
│   │   ├── app/                     # 应用管理
│   │   ├── config/                  # 配置中心
│   │   ├── database/                # 数据库管理与备份
│   │   ├── deploy/                  # 应用发布部署
│   │   ├── exec/                    # 批量执行 / 巡检 / Worker
│   │   ├── file/                    # 文件管理
│   │   ├── home/                    # 首页仪表盘
│   │   ├── host/                    # 主机管理
│   │   ├── monitor/                 # 监控中心
│   │   ├── notify/                  # 通知服务
│   │   ├── pipeline/                # CI/CD 流水线编排
│   │   ├── repository/              # 构建仓库
│   │   ├── schedule/                # 任务计划
│   │   └── setting/                 # 系统设置 / 存储配置
│   ├── consumer/                    # WebSocket Consumers
│   ├── libs/                        # 公共库
│   │   ├── execution/               # 执行引擎（SSH / Ansible）
│   │   ├── crypto.py                # Fernet 加密
│   │   ├── ssh.py                   # SSH 连接管理
│   │   ├── middleware.py            # 认证 / 异常 / 操作日志中间件
│   │   └── ...
│   ├── spug/                        # Django 项目配置
│   │   ├── settings.py              # 环境驱动的配置
│   │   ├── asgi.py                  # ASGI 入口
│   │   └── urls.py                  # URL 路由
│   ├── tools/                       # 服务启动脚本
│   ├── storage/                     # 文件存储目录
│   └── requirements.txt             # Python 依赖
├── spug_web/                        # 前端
│   └── src/
│       ├── components/              # 公共组件
│       ├── layout/                  # 布局与导航
│       ├── libs/                    # 公共工具库
│       ├── styles/tokens.css        # 设计令牌（深色模式）
│       ├── routes.js                # 路由与组件注册
│       └── pages/                   # 页面模块
│           ├── ansible/             # Ansible 管理（6 子模块）
│           ├── pipeline/            # 流水线编排（可视化编辑器）
│           ├── host/                # 主机管理
│           ├── deploy/              # 应用发布
│           ├── exec/                # 批量执行
│           ├── database/            # 数据库管理
│           ├── monitor/             # 监控中心
│           ├── alarm/               # 报警中心
│           ├── config/              # 配置中心
│           └── ...
├── docs/                            # 部署文档与 Docker 配置
│   ├── docker/                      # Docker Compose / Dockerfile
│   ├── install.sh                   # 一键安装脚本
│   └── FQA.md                       # 常见问题
└── LICENSE                          # AGPL-3.0
```

---

## 环境要求

| 组件 | 版本要求 |
|------|----------|
| Python | ≥ 3.12 |
| Node.js | ≥ 16 |
| Redis | ≥ 5.0 |
| 数据库 | MySQL ≥ 5.7 / PostgreSQL ≥ 12 / SQLite（开发默认） |

---

## 快速开始

### 开发环境

```bash
# 1. 后端
cd spug_api
cp env.example .env              # 编辑 .env 配置数据库和 Redis
pip install -r requirements.txt  # 安装依赖
python manage.py updatedb        # 初始化数据库 + 菜单
python manage.py useradd -u admin -p spug.dev -s -n 管理员  # 创建管理员
python manage.py runserver       # 启动开发服务器

# 2. 前端
cd spug_web
npm install
npm start                        # 启动开发服务器 (默认 3000 端口)

# 3. 后台服务（另开终端）
cd spug_api
python manage.py runworker       # Worker：批量执行 / Playbook / Pipeline
python manage.py runmonitor      # 监控检查
python manage.py runscheduler    # 定时任务调度
```

### Docker 部署

```bash
cd docs/docker
# 编辑 .env 设置 MYSQL_PASSWORD 和 MYSQL_ROOT_PASSWORD
docker-compose up -d
```

### 一键安装（CentOS / Ubuntu）

```bash
bash docs/install.sh
```

> 默认管理员账号：`admin` / `spug.dev`

---

## 环境变量

在 `spug_api/.env` 中配置（参考 `env.example`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SPUG_ENV` | `dev` | 运行环境（`dev` / `prod`） |
| `SECRET_KEY` | — | Django 密钥（**必填**） |
| `DEBUG` | `true` | 调试模式（生产环境必须 `false`） |
| `ALLOWED_HOSTS` | `*` | 允许的主机名（逗号分隔） |
| `DB_ENGINE` | `sqlite` | 数据库引擎（`sqlite` / `mysql` / `postgresql`） |
| `DB_HOST` | `127.0.0.1` | 数据库地址 |
| `DB_PORT` | `5432` | 数据库端口 |
| `DB_NAME` | — | 数据库名 |
| `DB_USER` | — | 数据库用户 |
| `DB_PASSWORD` | — | 数据库密码 |
| `REDIS_HOST` | `127.0.0.1` | Redis 地址 |
| `REDIS_PORT` | `6379` | Redis 端口 |
| `REDIS_PASSWORD` | — | Redis 密码 |
| `TOKEN_TTL` | `28800` | Token 有效期（秒，默认 8 小时） |

---

## 服务架构

![服务架构](./docs/images/17925082834fc8.png)

| 服务 | 启动命令 | 职责 |
|------|---------|------|
| API + WS | `daphne spug.asgi:application` | HTTP API + WebSocket |
| Worker | `python manage.py runworker` | 批量执行 / Playbook / Facts / Pipeline |
| Monitor | `python manage.py runmonitor` | 监控检查 |
| Scheduler | `python manage.py runscheduler` | 定时任务调度 |

> 统一管理：`tools/start-all.sh {start|stop|restart|status}`

---

## 常用管理命令

```bash
python manage.py updatedb              # 初始化/更新数据库（建表 + 菜单种子数据）
python manage.py updatedb --menu-only  # 仅更新菜单
python manage.py user add -u <用户> -p <密码> -s -n <昵称>  # 创建超级用户
python manage.py user add -u <用户> -p <密码> -n <昵称>     # 创建普通用户
```

---

## License

[AGPL-3.0](https://opensource.org/licenses/AGPL-3.0)

---

<div align="center">

<sub>本项目基于 [Spug](https://github.com/openspug/spug) 二次开发，感谢原作者的开源贡献。</sub>

</div>
