# spug.redis

安装并配置 Redis 服务，支持 RHEL/CentOS 与 Debian/Ubuntu。

## 特性

- 双平台支持（RedHat / Debian 系）
- 包安装与源码编译两种模式
- 配置模板化（端口、密码、内存、持久化等）
- systemd 服务管理 + 安全加固（PrivateTmp / ProtectSystem 等）
- Spug 表单友好（`defaults/main.yml` 含 `# SPUG:` hints）

## 变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `redis_version` | `7.0` | Redis 版本（源码安装时使用） |
| `redis_install_from` | `package` | 安装方式：`package` / `source` |
| `redis_port` | `6379` | 监听端口 |
| `redis_bind_interface` | `0.0.0.0` | 绑定地址 |
| `redis_requirepass` | `""` | 访问密码（空=无密码） |
| `redis_maxmemory` | `256mb` | 最大内存 |
| `redis_maxmemory_policy` | `allkeys-lru` | 淘汰策略 |
| `redis_appendonly` | `no` | AOF 持久化 |
| `redis_save` | 见 defaults | RDB 快照规则 |
| `redis_loglevel` | `notice` | 日志级别 |
| `redis_databases` | `16` | 数据库数量 |
| `redis_maxclients` | `10000` | 最大连接数 |

## 使用示例

### Playbook

```yaml
- hosts: webservers
  roles:
    - role: redis
      vars:
        redis_port: 6380
        redis_bind_interface: "127.0.0.1"
        redis_requirepass: "your-secret"
        redis_maxmemory: "512mb"
```

### Spug 平台

在 Spug「Role 市场」中添加本目录为 Role 源（本地路径），创建部署时通过表单填写上述变量即可。

## 验证

```bash
# 本地测试
cd spug_api/storage/roles/redis
ansible-playbook -i tests/inventory tests/test.yml --check

# 检查服务
systemctl status redis
redis-cli -a your-secret ping
```

## 目录结构

```
redis/
├── defaults/main.yml      # 默认变量（含 SPUG hints）
├── handlers/main.yml      # 服务重启
├── meta/main.yml          # Galaxy 元数据
├── tasks/
│   ├── main.yml           # 入口
│   ├── setup-RedHat.yml   # RHEL 系准备
│   ├── setup-Debian.yml   # Debian 系准备
│   ├── install-package.yml
│   └── install-source.yml
├── templates/
│   ├── redis.conf.j2      # 配置模板
│   └── redis.service.j2   # systemd unit（源码安装用）
├── vars/
│   ├── RedHat.yml
│   └── Debian.yml
└── tests/
    ├── inventory
    └── test.yml
```

## License

AGPL-3.0