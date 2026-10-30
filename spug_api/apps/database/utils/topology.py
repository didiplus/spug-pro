"""数据库集群拓扑自动发现

支持 MySQL/MariaDB、PostgreSQL、Redis 三种数据库的拓扑自动发现。
返回统一的拓扑 Schema 供前端渲染。
"""
import logging

from .imports import pymysql, redis, psycopg2

logger = logging.getLogger(__name__)


def _build_node(instance, role="standalone", parent_id=None, lag=None, extra_metrics=None):
    """构建统一节点结构"""
    node = {
        "id": instance.id,
        "name": instance.name,
        "role": role,
        "host": instance.host,
        "port": instance.port,
        "type": instance.type,
        "status": "online" if instance.status == 0 else "offline",
        "parent_id": parent_id,
        "metrics": {"lag": lag},
    }
    if extra_metrics:
        node["metrics"].update(extra_metrics)
    return node


def _assess_health(nodes):
    """根据节点状态评估集群健康度"""
    if not nodes:
        return "unknown"
    offline = [n for n in nodes if n["status"] == "offline"]
    high_lag = [n for n in nodes if n["metrics"].get("lag") and n["metrics"]["lag"] > 10]
    if offline:
        return "critical"
    if high_lag:
        return "warning"
    return "healthy"


def discover_mysql_topology(instances):
    """发现 MySQL/MariaDB 主从拓扑

    通过 SHOW REPLICA STATUS / SHOW SLAVE STATUS 获取复制关系。
    instances: 同一集群的所有 DatabaseInstance 列表
    """
    nodes = []
    edges = []
    replication_map = {}

    for inst in instances:
        role = "standalone"
        parent_host = None
        parent_port = None
        lag = None
        extra = {}

        if pymysql is None:
            nodes.append(_build_node(inst, role=role))
            continue


        try:
            with pymysql.connect(
                host=inst.host, port=int(inst.port),
                user=inst.username, password=inst.password or "",
                connect_timeout=5, charset="utf8mb4",
            ) as conn:
                with conn.cursor() as cursor:
                    cursor.execute("SELECT @@VERSION")
                    extra["version"] = cursor.fetchone()[0]

                    cursor.execute("SHOW SLAVE STATUS")
                    slave_rows = cursor.fetchall()
                    if slave_rows:
                        cols = [d[0] for d in cursor.description]
                        slave_info = dict(zip(cols, slave_rows[0]))
                        if slave_info.get("Slave_IO_Running") == "Yes" or slave_info.get("Replica_IO_Running") == "Yes":
                            role = "replica"
                            parent_host = slave_info.get("Master_Host")
                            parent_port = int(slave_info.get("Master_Port", 3306))
                            lag = float(slave_info.get("Seconds_Behind_Master") or 0)
                    else:
                        try:
                            cursor.execute("SHOW REPLICAS")
                            if cursor.fetchall():
                                role = "primary"
                        except Exception:
                            role = "primary"

                    cursor.execute("SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Uptime')")
                    for row in cursor.fetchall():
                        if row[0] == "Threads_connected":
                            extra["connections"] = int(row[1])
                        elif row[0] == "Uptime":
                            extra["uptime"] = int(row[1])
        except Exception as e:
            logger.warning(f"MySQL topology discovery failed for {inst.name}: {e}")
            role = inst.cluster_role or "standalone"
            parent_host = None
            lag = inst.replication_lag
            if inst.cluster_parent_id:
                for other in instances:
                    if other.id == inst.cluster_parent_id:
                        parent_host = other.host
                        parent_port = other.port
                        break

        if role == "replica" and parent_host:
            replication_map[inst.id] = (parent_host, parent_port, lag)

        nodes.append(_build_node(inst, role=role, lag=lag, extra_metrics=extra))

    for replica_id, (master_host, master_port, lag) in replication_map.items():
        matched = _match_instance_by_host_port(master_host, master_port, instances)
        if not matched:
            replica_node = next((n for n in nodes if n["id"] == replica_id), None)
            same_type_primaries = [
                inst for inst in instances
                if inst.id != replica_id and inst.type == (replica_node["type"] if replica_node else "")
                and inst.id not in replication_map
                and inst.status == 0
            ]
            if len(same_type_primaries) == 1:
                matched = same_type_primaries[0]
        if matched:
            edges.append({
                "from": matched.id,
                "to": replica_id,
                "type": "replication",
                "label": f"{lag}s lag" if lag is not None else "",
            })
            for n in nodes:
                if n["id"] == replica_id:
                    n["parent_id"] = matched.id
                if n["id"] == matched.id and n["role"] == "standalone":
                    n["role"] = "primary"

    topology_type = "master_slave"
    primary_count = sum(1 for n in nodes if n["role"] == "primary")
    if primary_count > 1:
        topology_type = "master_master"
    elif primary_count == 0 and any(n["role"] == "replica" for n in nodes):
        topology_type = "master_slave"

    return _build_result(instances, nodes, edges, topology_type)


def discover_postgresql_topology(instances):
    """发现 PostgreSQL 流复制拓扑

    通过 pg_stat_replication 获取主从关系和复制延迟。
    """
    nodes = []
    edges = []
    replication_map = {}

    for inst in instances:
        role = "standalone"
        parent_host = None
        parent_port = None
        lag = None
        extra = {}

        if psycopg2 is None:
            nodes.append(_build_node(inst, role=role))
            continue


        try:
            conn = psycopg2.connect(
                host=inst.host, port=int(inst.port),
                user=inst.username, password=inst.password or "",
                dbname="postgres", connect_timeout=5,
            )
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT version()")
                    extra["version"] = cur.fetchone()[0]

                    cur.execute("""
                        SELECT client_addr, client_port, state,
                               EXTRACT(EPOCH FROM (now() - replay_lag))::float AS lag_seconds
                        FROM pg_stat_replication
                    """)
                    replica_rows = cur.fetchall()
                    if replica_rows:
                        role = "primary"

                    cur.execute("""
                        SELECT sender_host, sender_port,
                               EXTRACT(EPOCH FROM (now() - replay_lag))::float AS lag_seconds
                        FROM pg_stat_wal_receiver
                    """)
                    wal_rows = cur.fetchall()
                    if wal_rows:
                        role = "replica"
                        for row in wal_rows:
                            parent_host = str(row[0]) if row[0] else None
                            parent_port = int(row[1]) if row[1] else 5432
                            lag = float(row[2]) if row[2] else 0

                    cur.execute("SELECT count(*) FROM pg_stat_activity")
                    extra["connections"] = cur.fetchone()[0]
            finally:
                conn.close()
        except Exception as e:
            logger.warning(f"PostgreSQL topology discovery failed for {inst.name}: {e}")
            role = inst.cluster_role or "standalone"
            parent_host = None
            lag = inst.replication_lag
            if inst.cluster_parent_id:
                for other in instances:
                    if other.id == inst.cluster_parent_id:
                        parent_host = other.host
                        parent_port = other.port
                        break

        if role == "replica" and parent_host:
            replication_map[inst.id] = (parent_host, parent_port, lag)

        nodes.append(_build_node(inst, role=role, lag=lag, extra_metrics=extra))

    for replica_id, (master_host, master_port, lag) in replication_map.items():
        matched = _match_instance_by_host_port(master_host, master_port, instances)
        if matched:
            edges.append({
                "from": matched.id,
                "to": replica_id,
                "type": "replication",
                "label": f"{lag}s lag" if lag else "",
            })
            for n in nodes:
                if n["id"] == replica_id:
                    n["parent_id"] = matched.id
                if n["id"] == matched.id and n["role"] == "standalone":
                    n["role"] = "primary"

    topology_type = "master_slave"
    primary_count = sum(1 for n in nodes if n["role"] == "primary")
    if primary_count > 1:
        topology_type = "master_master"

    return _build_result(instances, nodes, edges, topology_type)


def discover_redis_topology(instances):
    """发现 Redis 主从/哨兵/集群拓扑

    通过 INFO replication 获取主从关系。
    """
    nodes = []
    edges = []
    replication_map = {}

    for inst in instances:
        role = "standalone"
        parent_host = None
        parent_port = None
        lag = None
        extra = {}

        if redis is None:
            nodes.append(_build_node(inst, role=role))
            continue


        try:
            conn_params = {
                "host": inst.host, "port": int(inst.port),
                "socket_connect_timeout": 5, "socket_timeout": 5,
                "decode_responses": True,
            }
            if inst.username and str(inst.username).strip():
                conn_params["username"] = inst.username
            if inst.password and str(inst.password).strip():
                conn_params["password"] = inst.password

            client = redis.Redis(**conn_params)
            client.ping()
            info = client.info("replication")
            role = info.get("role", "standalone")

            if role == "master":
                extra["connected_slaves"] = info.get("connected_slaves", 0)
            elif role == "slave":
                parent_host = info.get("master_host")
                parent_port = int(info.get("master_port", 6379))
                lag = int(info.get("master_link_status") == "up" and info.get("slave_repl_offset", 0) - info.get("master_repl_offset", 0) or 0)

            server_info = client.info("server")
            extra["version"] = server_info.get("redis_version", "")
            extra["uptime"] = server_info.get("uptime_in_seconds", 0)
            client.close()
        except Exception as e:
            logger.warning(f"Redis topology discovery failed for {inst.name}: {e}")
            role = inst.cluster_role or "standalone"
            parent_host = None
            lag = inst.replication_lag
            if inst.cluster_parent_id:
                for other in instances:
                    if other.id == inst.cluster_parent_id:
                        parent_host = other.host
                        parent_port = other.port
                        break

        if role == "slave" and parent_host:
            replication_map[inst.id] = (parent_host, parent_port, lag)

        nodes.append(_build_node(inst, role=role, lag=lag, extra_metrics=extra))

    for replica_id, (master_host, master_port, lag) in replication_map.items():
        matched = _match_instance_by_host_port(master_host, master_port, instances)
        if matched:
            edges.append({
                "from": matched.id,
                "to": replica_id,
                "type": "replication",
                "label": f"{lag}s lag" if lag else "",
            })
            for n in nodes:
                if n["id"] == replica_id:
                    n["parent_id"] = matched.id
                if n["id"] == matched.id and n["role"] == "standalone":
                    n["role"] = "primary"

    topology_type = "master_slave"
    return _build_result(instances, nodes, edges, topology_type)


def _build_result(instances, nodes, edges, topology_type):
    """构建统一返回结果"""
    cluster_name = instances[0].cluster if instances else ""
    db_type = instances[0].type if instances else ""
    health = _assess_health(nodes)

    primary_node = next((n for n in nodes if n["role"] in ("primary", "master")), None)
    if primary_node:
        for node in nodes:
            if node["role"] == "standalone" and node["status"] == "offline":
                node["role"] = "replica"
                node["parent_id"] = primary_node["id"]

    existing_edge_pairs = {(e["from"], e["to"]) for e in edges}
    for node in nodes:
        pid = node.get("parent_id")
        if pid and (pid, node["id"]) not in existing_edge_pairs:
            edges.append({"from": pid, "to": node["id"], "label": "复制"})
            existing_edge_pairs.add((pid, node["id"]))

    return {
        "cluster_name": cluster_name,
        "db_type": db_type,
        "topology_type": topology_type,
        "health_status": health,
        "node_count": len(nodes),
        "nodes": nodes,
        "edges": edges,
    }


DISCOVERY_DISPATCH = {
    "mysql": discover_mysql_topology,
    "mariadb": discover_mysql_topology,
    "postgresql": discover_postgresql_topology,
    "redis": discover_redis_topology,
}


def discover_topology(instances):
    """根据数据库类型分派到对应的发现函数

    instances: 同一集群的所有 DatabaseInstance QuerySet/列表
    """
    if not instances:
        return None

    db_type = instances[0].type
    discoverer = DISCOVERY_DISPATCH.get(db_type)
    if not discoverer:
        return {
            "cluster_name": instances[0].cluster or "",
            "db_type": db_type,
            "topology_type": "unknown",
            "health_status": "unknown",
            "node_count": len(instances),
            "nodes": [_build_node(inst) for inst in instances],
            "edges": [],
        }

    return discoverer(instances)

# ==================== 自动发现集群 ====================

import socket

def _normalize_host(host):
    """将 host 归一化为 IP 地址用于匹配"""
    if not host:
        return None
    host = str(host).strip()
    if host in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        return "127.0.0.1"
    try:
        return socket.gethostbyname(host)
    except Exception:
        return host


def _match_instance_by_host_port(target_host, target_port, instances):
    """通过 host:port 匹配实例，支持 IP 归一化和模糊匹配"""
    if not target_host:
        return None
    target_port = int(target_port)
    target_ip = _normalize_host(target_host)

    for inst in instances:
        if inst.port == target_port:
            if inst.host == target_host:
                return inst
            inst_ip = _normalize_host(inst.host)
            if inst_ip == target_ip:
                return inst

    port_matches = [inst for inst in instances if inst.port == target_port]
    if len(port_matches) == 1:
        return port_matches[0]

    return None


class UnionFind:
    """并查集 — 用于连通分量分析"""

    def __init__(self, n):
        self.parent = list(range(n))
        self.rank = [0] * n

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, x, y):
        px, py = self.find(x), self.find(y)
        if px == py:
            return
        if self.rank[px] < self.rank[py]:
            px, py = py, px
        self.parent[py] = px
        if self.rank[px] == self.rank[py]:
            self.rank[px] += 1

    def groups(self):
        result = {}
        for i in range(len(self.parent)):
            root = self.find(i)
            result.setdefault(root, []).append(i)
        return list(result.values())


def _query_replication_link(instance):
    """查询单个实例的复制关系，返回 (master_host, master_port) 或 None"""
    result, _ = _query_replication_link_debug(instance)
    return result


def _query_replication_link_debug(instance):
    """查询单个实例的复制关系，返回 ((master_host, master_port), diagnostic_msg)"""
    db_type = instance.type
    try:
        if db_type in ("mysql", "mariadb"):
            if pymysql is None:
                return None, "pymysql not installed"
            with pymysql.connect(
                host=instance.host, port=int(instance.port),
                user=instance.username, password=instance.password or "",
                connect_timeout=5, charset="utf8mb4",
            ) as conn:
                with conn.cursor() as cursor:
                    cursor.execute("SHOW SLAVE STATUS")
                    rows = cursor.fetchall()
                    if rows:
                        cols = [d[0] for d in cursor.description]
                        info = dict(zip(cols, rows[0]))
                        io_running = info.get("Slave_IO_Running") == "Yes" or info.get("Replica_IO_Running") == "Yes"
                        if io_running:
                            mh = info.get("Master_Host")
                            mp = int(info.get("Master_Port", 3306))
                            return (mh, mp), f"slave -> {mh}:{mp}"
                        else:
                            return None, f"Slave_IO_Running={info.get('Slave_IO_Running')}, not replicating"
                    else:
                        try:
                            cursor.execute("SHOW REPLICA STATUS")
                            rows2 = cursor.fetchall()
                            if rows2:
                                cols2 = [d[0] for d in cursor.description]
                                info2 = dict(zip(cols2, rows2[0]))
                                if info2.get("Replica_IO_Running") == "Yes":
                                    sh = info2.get("Source_Host")
                                    sp = int(info2.get("Source_Port", 3306))
                                    return (sh, sp), f"replica -> {sh}:{sp}"
                                return None, f"Replica_IO_Running={info2.get('Replica_IO_Running')}, not replicating"
                        except Exception:
                            pass
                        return None, "primary (no slave status)"
        elif db_type == "postgresql":
            if psycopg2 is None:
                return None, "psycopg2 not installed"
            conn = psycopg2.connect(
                host=instance.host, port=int(instance.port),
                user=instance.username, password=instance.password or "",
                dbname="postgres", connect_timeout=5,
            )
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT sender_host, sender_port FROM pg_stat_wal_receiver")
                    row = cur.fetchone()
                    if row and row[0]:
                        return (str(row[0]), int(row[1]) if row[1] else 5432), "replica"
                    return None, "primary (no wal receiver)"
            finally:
                conn.close()
        elif db_type == "redis":
            if redis is None:
                return None, "redis-py not installed"
            conn_params = {
                "host": instance.host, "port": int(instance.port),
                "socket_connect_timeout": 5, "socket_timeout": 5,
                "decode_responses": True,
            }
            if instance.username and str(instance.username).strip():
                conn_params["username"] = instance.username
            if instance.password and str(instance.password).strip():
                conn_params["password"] = instance.password
            client = redis.Redis(**conn_params)
            try:
                info = client.info("replication")
                if info.get("role") == "slave":
                    return (info.get("master_host"), int(info.get("master_port", 6379))), "slave"
                return None, f"role={info.get('role')}"
            finally:
                client.close()
        else:
            return None, f"unsupported type: {db_type}"
    except Exception as e:
        logger.warning(f"Replication query failed for {instance.name}: {e}")
        return None, f"error: {e}"


def auto_discover_clusters(instances):
    """自动发现集群 — 基于复制关系的连通分量分析

    返回: (cluster_map, standalone_ids, diagnostics)
    """
    all_instances = list(instances)
    if not all_instances:
        return {}, [], []

    manual_clusters = {}
    auto_instances = []
    diagnostics = []

    for inst in all_instances:
        if inst.cluster and inst.cluster.strip():
            manual_clusters.setdefault(inst.cluster, []).append(inst.id)
        else:
            auto_instances.append(inst)

    standalone_ids = []
    joined_ids = set()
    if not auto_instances:
        return manual_clusters, standalone_ids, diagnostics

    id_to_idx = {inst.id: i for i, inst in enumerate(auto_instances)}

    uf = UnionFind(len(auto_instances))
    for i, inst in enumerate(auto_instances):
        link, msg = _query_replication_link_debug(inst)
        diagnostics.append({
            "name": inst.name,
            "host": f"{inst.host}:{inst.port}",
            "type": inst.type,
            "link": f"{link[0]}:{link[1]}" if link else None,
            "message": msg,
        })
        if not link:
            continue
        master_host, master_port = link
        matched = _match_instance_by_host_port(master_host, master_port, all_instances)
        if not matched:
            same_type_primaries = [
                inst2 for inst2 in all_instances
                if inst2.id != inst.id and inst2.type == inst.type
                and not _query_replication_link(inst2)
                and inst2.status == 0
            ]
            if len(same_type_primaries) == 1:
                matched = same_type_primaries[0]
                diagnostics[-1]["message"] += f" (fallback matched {matched.name})"
            else:
                diagnostics[-1]["message"] += f" (no match for {master_host}:{master_port})"
        if matched:
            if matched.id in id_to_idx:
                uf.union(i, id_to_idx[matched.id])
                logger.info(f"Auto-discover: linked {inst.name} -> {matched.name}")
            elif matched.cluster and matched.cluster.strip():
                manual_clusters.setdefault(matched.cluster, []).append(inst.id)
                joined_ids.add(inst.id)
                diagnostics[-1]["message"] += f" (joined cluster '{matched.cluster}')"
                logger.info(f"Auto-discover: {inst.name} joined existing cluster '{matched.cluster}'")

    auto_clusters = {}
    for group in uf.groups():
        if len(group) == 1:
            inst_id = auto_instances[group[0]].id
            if inst_id not in joined_ids:
                standalone_ids.append(inst_id)
            continue
        primary_name = None
        for idx in group:
            link, _ = _query_replication_link_debug(auto_instances[idx])
            if not link:
                primary_name = auto_instances[idx].name
                break
        if not primary_name:
            primary_name = auto_instances[group[0]].name
        db_type = auto_instances[group[0]].type
        cluster_name = f"auto-{db_type}-{primary_name}"
        auto_clusters[cluster_name] = [auto_instances[idx].id for idx in group]
        logger.info(f"Auto-discover: cluster '{cluster_name}' with {len(group)} instances")

    result = {**manual_clusters, **auto_clusters}
    return result, standalone_ids, diagnostics