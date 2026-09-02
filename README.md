<h1 align="center">Spug  Pro</h1>

<div align="center">

Spug Pro是一款基于Spug源码扩展的进行二次开发的企业级自动化运维平台，专为企业设计，提供更强大的功能和更高的性能。是面向中小型企业设计的轻量级无 Agent 自动化运维平台，整合了主机管理、批量执行、在线终端、应用发布部署、任务计划、配置中心、数据库管理、Playbook 管理、Ansible 管理、监控报警等全栈运维能力。 

</div>

- 项目官网：https://ops.spug.cc
- 使用文档：https://ops.spug.cc/docs/about-spug/

## 演示环境

演示地址：https://demo.spug.cc

## 特性

### 核心运维
- **主机管理**: 主机信息集中管理，支持分组与标签
- **批量执行**: 主机命令在线批量执行，支持模板化管理
- **在线终端**: 浏览器在线 SSH 终端，基于 xterm.js 实时交互
- **文件管理**: 主机文件在线上传下载与远程管理
- **文件分发**: 跨主机文件批量分发

### 发布与配置
- **应用发布**: 支持自定义发布部署流程，多环境多应用管理
- **构建仓库**: Git 仓库集成，在线触发构建与版本管理
- **发布申请**: 完整的申请-审核-执行发布工作流
- **配置中心**: 支持 KV、文本、JSON 等格式的配置管理，多环境隔离

### 数据库管理
- **多数据库支持**: MySQL、PostgreSQL、SQL Server、Oracle、MongoDB、Redis、ClickHouse 等 12 种数据库
- **在线 SQL 执行**: 数据库在线查询与执行，支持语法高亮
- **数据库备份**: 异步备份执行，支持保留策略（按数量/时间/GFS 旋转）与远程存储
- **远程存储**: 支持 S3、阿里云 OSS、腾讯云 COS、华为云 OBS 四种云存储后端

### 自动化与编排
- **Playbook 管理**: Ansible Playbook 在线管理与执行，实时日志推送
- **Ansible Inventory**: 动态 Inventory 管理，支持主机分组与变量
- **Ansible Vault**: 敏感数据加密管理
- **Facts 采集**: 主机信息自动采集与浏览
- **Ansible Role**: 角色管理复用

### 监控与报警
- **监控中心**: 支持站点、端口、进程、自定义脚本等监控
- **报警中心**: 报警记录查询与统计
- **报警联系人**: 支持短信、邮件、钉钉、微信等报警通知方式
- **报警策略**: 灵活的报警规则与阈值配置

### 系统管理
- **账户管理**: 用户管理支持手机、邮箱、部门等扩展字段
- **角色权限**: 基于角色的细粒度权限控制，支持页面权限与发布权限
- **菜单管理**: 动态菜单配置，支持图标选择与组件注册
- **系统设置**: 全局配置、存储配置、MFA 设置
- **登录日志**: 用户登录历史记录
- **操作日志**: 异步操作日志记录，支持模块、状态、耗时等多维筛选
- **任务计划**: 灵活的在线定时任务调度

### 平台特性
- **无 Agent**: 基于 SSH 协议，无需在被控端安装 Agent
- **实时通信**: 基于 WebSocket 的实时日志推送与终端交互
- **优雅美观**: 基于 Ant Design 5 的 UI 界面
- **开源免费**: 前后端代码完全开源

## 技术栈

### 后端
- Python 3.12
- Django 3.2
- Redis（缓存 / 消息队列 / 实时推送）
- Channels + WebSocket
- Paramiko（SSH 连接）
- Ansible Runner（自动化执行引擎）
- boto3 / oss2（云存储 SDK）

### 前端
- React 16
- Ant Design 5
- MobX（状态管理）
- xterm.js（Web 终端）
- Ace Editor（代码编辑器）
- BizCharts（数据可视化）

## 项目结构

```
spug-4.0/
├── spug_api/                    # 后端
│   ├── apps/
│   │   ├── account/             # 账户、角色、权限、操作日志
│   │   ├── alarm/               # 报警中心
│   │   ├── ansible/             # Ansible 管理
│   │   ├── config/              # 配置中心
│   │   ├── database/            # 数据库管理与备份
│   │   ├── deploy/              # 应用发布
│   │   ├── exec/                # 批量执行与巡检
│   │   ├── host/                # 主机管理
│   │   ├── monitor/             # 监控中心
│   │   ├── notify/              # 通知服务
│   │   ├── playbook/            # Playbook 管理
│   │   ├── repository/          # 构建仓库
│   │   ├── schedule/            # 任务计划
│   │   └── setting/             # 系统设置与存储配置
│   ├── libs/                    # 公共库（中间件、装饰器、执行引擎）
│   └── spug/                    # Django 项目配置
├── spug_web/                    # 前端
│   └── src/
│       ├── components/          # 公共组件
│       ├── layout/              # 布局与导航
│       ├── libs/                # 公共工具库
│       └── pages/               # 页面模块
└── docs/                        # 文档与 Docker 配置
```

## 环境

- Python 3.12+
- Node 16+
- MySQL 5.7+
- Redis 5.0+

## 安装

### Docker 安装（推荐）

```bash
docker run -d --restart=always --name=spug -p 80:80 -v /data/spug:/data registry.swcc.cc/openspug/spug
```

[官方安装文档](https://ops.spug.cc/docs/install-docker)

### 开发环境

```bash
# 后端
cd spug_api
pip install -r requirements.txt
python manage.py migrate
python manage.py init_spug  # 初始化管理员
python manage.py runserver 8080

# 前端
cd spug_web
npm install
npm start
```

更多使用帮助请参考 [使用文档](https://ops.spug.cc/docs/host-manage/)

## 预览

### 主机管理
![image](https://cdn.spug.cc/img/3.0/host.jpg)

#### 主机在线终端
![image](https://cdn.spug.cc/img/3.0/web-terminal.jpg)

#### 文件在线上传下载
![image](https://cdn.spug.cc/img/3.0/file-manager.jpg)

#### 主机批量执行
![image](https://cdn.spug.cc/img/3.0/host-exec.jpg)
![image](https://cdn.spug.cc/img/3.0/host-exec2.jpg)

#### 应用发布
![image](https://cdn.spug.cc/img/3.0/deploy.jpg)

#### 监控报警
![image](https://cdn.spug.cc/img/3.0/monitor.jpg)

#### 角色权限
![image](https://cdn.spug.cc/img/3.0/user-role.jpg)

## 推荐项目
[Yearning — MySQL 开源 SQL 语句审核平台](https://github.com/cookieY/Yearning)

## 开发者群
#### 关注 Spug 运维公众号加微信群、QQ 群、获取最新产品动态
<div>
   <img src="https://cdn.spug.cc/img/spug-club.jpg" width = "300" height = "300" alt="spug-qq" align=center />
<div>

## License & Copyright
[AGPL-3.0](https://opensource.org/licenses/AGPL-3.0)
