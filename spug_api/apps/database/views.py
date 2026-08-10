from django.views.generic import View
from django.views.decorators.http import require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt
import json
import os
from apps.database.utils import TEST_FETCHERS, DETAIL_FETCHERS, SQL_EXECUTORS, SLOW_QUERY_FETCHERS, BACKUP_CREATORS, REPLICATION_FETCHERS
from apps.database.models import DatabaseInstance, DatabaseBackup, SQLExecutionHistory
from django.core.exceptions import ObjectDoesNotExist
from django.utils.decorators import method_decorator
from libs import json_response
from libs.decorators import auth


@method_decorator(csrf_exempt, name='dispatch')
class DatabaseInstanceView(View):
    """
    数据库实例管理视图 (RESTful CRUD)
    - GET    /instances/          → 列表
    - GET    /instances/<id>/     → 详情（含实时数据）
    - POST   /instances/          → 创建
    - PUT    /instances/<id>/     → 全量更新
    - DELETE /instances/<id>/     → 删除
    """
    http_method_names = ['get', 'post', 'put', 'patch', 'delete']

    def _parse_json(self, request):
        try:
            return json.loads(request.body), None
        except json.JSONDecodeError:
            return json_response(error="Invalid JSON")

    def _get_instance_or_404(self, instance_id):
        try:
            return DatabaseInstance.objects.get(pk=instance_id), None
        except ObjectDoesNotExist:
            return None, json_response(error="Instance not found")

    def _serialize(self, instance):
        data = instance.to_dict()
        data.pop('password', None)
        data['created_by_name'] = instance.created_by.username if instance.created_by else None
        return data

    def _fetch_live_detail(self, instance):
        fetcher = DETAIL_FETCHERS.get(instance.type)
        if not fetcher:
            return None
        return fetcher(instance.host, instance.port, instance.username, instance.password)

    # ---------- GET：列表 / 详情 ----------
    def get(self, request, *args, **kwargs):
        if not request.user.has_perms(['database.instance.view']):
            return json_response(error='权限拒绝')
        instance_id = kwargs.get('id')
        if instance_id is not None:
            instance, error = self._get_instance_or_404(instance_id)
            if error:
                return error
            data = self._serialize(instance)
            try:
                data['live'] = self._fetch_live_detail(instance)
            except Exception as e:
                data['live'] = None
                data['live_error'] = str(e)
            return json_response(data)
        else:
            queryset = DatabaseInstance.objects.all()
            data = [self._serialize(inst) for inst in queryset]
            online = queryset.filter(status=0).count()
            type_counts = {}
            for inst in queryset:
                type_counts[inst.type] = type_counts.get(inst.type, 0) + 1
            return json_response({
                'count': len(data),
                'results': data,
                'online': online,
                **{k: v for k, v in type_counts.items()},
            })

    # ---------- POST：创建 ----------
    def post(self, request, *args, **kwargs):
        if not request.user.has_perms(['database.instance.add']):
            return json_response(error='权限拒绝')
        data, error = self._parse_json(request)
        if error:
            return error

        required = ['host', 'type', 'port']
        missing = [f for f in required if f not in data]
        if missing:
            return json_response(error=f'Missing fields: {", ".join(missing)}')

        host = data['host']
        db_type = data['type']
        port = int(data['port'])
        username = data.get('username') or None
        password = data.get('password') or None

        try:
            tester = TEST_FETCHERS.get(db_type)
            if not tester:
                return json_response(error=f'Unsupported database type: {db_type}')
            test_result = tester(host, port, username, password)

            if not test_result.get('success'):
                return json_response(error=f'Connection failed: {test_result.get("message", "Unknown error")}')

            version = test_result.get('version', '')
        except Exception as e:
            return json_response(error=f'Connection test error: {str(e)}')

        try:
            instance = DatabaseInstance.objects.create(
                name=data.get('name', f"{host}:{port}"),
                type=db_type,
                host=host,
                port=port,
                username=username,
                password=password,
                version=version,
                charset=data.get('charset', 'utf8mb4'),
                status=int(data.get('status', 0)),
                cluster=data.get('cluster') or None,
                created_by=request.user,
            )
            return json_response(self._serialize(instance))
        except Exception as e:
            return json_response(error=str(e))

    # ---------- PUT：全量更新 ----------
    def put(self, request, *args, **kwargs):
        if not request.user.has_perms(['database.instance.edit']):
            return json_response(error='权限拒绝')
        instance_id = kwargs.get('id')
        instance, error = self._get_instance_or_404(instance_id)
        if error:
            return error

        data, error = self._parse_json(request)
        if error:
            return error

        required = ['name', 'type', 'host', 'port', 'username', 'password']
        missing = [f for f in required if f not in data]
        if missing:
            return json_response(error=f'Missing fields for full update: {", ".join(missing)}')
        try:
            instance.name = data['name']
            instance.type = data['type']
            instance.host = data['host']
            instance.port = int(data['port'])
            instance.username = data['username']
            if data.get('password'):
                instance.password = data['password']
            instance.version = data.get('version') if 'version' in data else instance.version
            instance.charset = data.get('charset', 'utf8mb4')
            instance.status = int(data.get('status', 0))
            instance.cluster = data.get('cluster') or None
            instance.save()
            return json_response(self._serialize(instance))
        except Exception as e:
            return json_response(error=str(e))

    # ---------- DELETE：删除 ----------
    def delete(self, request, *args, **kwargs):
        if not request.user.has_perms(['database.instance.del']):
            return json_response(error='权限拒绝')
        instance_id = kwargs.get('id')
        instance, error = self._get_instance_or_404(instance_id)
        if error:
            return error
        try:
            instance.delete()
            return json_response(data={'message': '删除成功'})
        except Exception as e:
            return json_response(error=str(e))


@csrf_exempt
@auth('database.instance.add|database.instance.edit')
@require_POST
def test_connection_databases(request):
    try:
        if request.content_type == 'application/json':
            data = json.loads(request.body)
        else:
            data = {
                'host': request.POST.get('host'),
                'port': request.POST.get('port'),
                'username': request.POST.get('username'),
                'password': request.POST.get('password'),
                'type': request.POST.get('type', 'mysql'),
            }
    except json.JSONDecodeError:
        return json_response(error='Invalid JSON body')

    host = data.get('host')
    port = data.get('port')
    username = data.get('username')
    password = data.get('password')
    db_type = data.get('type', 'mysql')

    if not all([host, port, username, password]):
        return json_response(error='Missing required fields: host, port, username, password')

    tester = TEST_FETCHERS.get(db_type)
    if not tester:
        return json_response(error=f'Unsupported database type: {db_type}')

    try:
        result = tester(host, port, username, password)
    except Exception as e:
        return json_response(error=f'Internal error: {str(e)}')

    return json_response(result)


@csrf_exempt
@auth('database.instance.execute')
@require_POST
def execute_sql(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return json_response(error='Invalid JSON body')

    instance_id = data.get('id')
    sql = (data.get('sql') or '').strip()
    database = data.get('database') or None

    if not instance_id or not sql:
        return json_response(error='Missing required fields: id, sql')

    try:
        instance = DatabaseInstance.objects.get(pk=instance_id)
    except ObjectDoesNotExist:
        return json_response(error='Instance not found')

    executor = SQL_EXECUTORS.get(instance.type)
    if not executor:
        return json_response(error=f'SQL execution not supported for type: {instance.type}')

    import re
    sql_lower = sql.lower()
    sql_clean = re.sub(r'--.*?$|/\*.*?\*/|#.*?$', '', sql_lower, flags=re.MULTILINE | re.DOTALL)
    sql_clean = re.sub(r'\s+', ' ', sql_clean).strip()
    tokens = re.findall(r"[a-zA-Z_]+", sql_clean)

    DANGEROUS_KEYWORDS = {
        'drop', 'truncate', 'shutdown', 'kill', 'alter', 'grant', 'revoke',
        'load_file', 'outfile', 'dumpfile', 'create', 'rename', 'replace',
        'insert', 'update', 'delete', 'merge', 'call', 'exec', 'execute',
        'handler', 'lock', 'unlock', 'flush', 'reset', 'purge', 'set',
    }
    for token in tokens:
        if token in DANGEROUS_KEYWORDS:
            return json_response(error=f'包含危险关键字: {token}，禁止执行')

    ALLOWED_COMMANDS = {'select', 'show', 'describe', 'desc', 'explain'}
    first_word = tokens[0] if tokens else ''
    if first_word not in ALLOWED_COMMANDS:
        return json_response(error='仅允许执行查询类语句 (SELECT, SHOW, DESCRIBE, EXPLAIN)')

    import time
    start = time.time()
    try:
        result = executor(
            instance.host, instance.port,
            instance.username, instance.password,
            sql, database=database,
        )
        duration_ms = int((time.time() - start) * 1000)
        try:
            SQLExecutionHistory.objects.create(
                instance=instance,
                database=database,
                sql=sql[:5000],
                status='success',
                affected=result.get('affected') if isinstance(result, dict) else None,
                rows_count=len(result.get('rows', [])) if isinstance(result, dict) else None,
                duration=duration_ms,
                created_by=request.user,
            )
        except Exception:
            pass
        return json_response(result)
    except Exception as e:
        duration_ms = int((time.time() - start) * 1000)
        try:
            SQLExecutionHistory.objects.create(
                instance=instance,
                database=database,
                sql=sql[:5000],
                status='failed',
                error_message=str(e)[:1000],
                duration=duration_ms,
                created_by=request.user,
            )
        except Exception:
            pass
        return json_response(error=f'SQL execution error: {str(e)}')


@csrf_exempt
@auth('database.instance.view')
@require_GET
def slow_queries(request, instance_id):
    if request.method != 'GET':
        return json_response(error='Method not allowed')

    try:
        instance = DatabaseInstance.objects.get(pk=instance_id)
    except ObjectDoesNotExist:
        return json_response(error='Instance not found')

    fetcher = SLOW_QUERY_FETCHERS.get(instance.type)
    if not fetcher:
        return json_response(error=f'Slow query analysis not supported for type: {instance.type}')

    limit = min(int(request.GET.get('limit', 50)), 200)
    try:
        result = fetcher(instance.host, instance.port, instance.username, instance.password, limit=limit)
        return json_response(result)
    except Exception as e:
        return json_response(error=f'Slow query analysis error: {str(e)}')


@csrf_exempt
@auth('database.instance.execute')
def sql_history_list(request, instance_id):
    if request.method != 'GET':
        return json_response(error='Method not allowed')

    try:
        instance = DatabaseInstance.objects.get(pk=instance_id)
    except ObjectDoesNotExist:
        return json_response(error='Instance not found')

    queryset = SQLExecutionHistory.objects.filter(instance=instance)
    database = request.GET.get('database')
    if database:
        queryset = queryset.filter(database=database)
    status = request.GET.get('status')
    if status:
        queryset = queryset.filter(status=status)

    page = int(request.GET.get('page', 1))
    page_size = min(int(request.GET.get('page_size', 20)), 100)
    total = queryset.count()
    rows = queryset[(page - 1) * page_size:page * page_size]
    data = []
    for h in rows:
        d = h.to_dict()
        d['created_by_name'] = h.created_by.username if h.created_by else None
        data.append(d)
    return json_response({'total': total, 'results': data})


@csrf_exempt
@auth('database.instance.execute')
def sql_history_detail(request, instance_id, history_id):
    if request.method != 'DELETE':
        return json_response(error='Method not allowed')

    try:
        history = SQLExecutionHistory.objects.get(pk=history_id, instance_id=instance_id)
    except SQLExecutionHistory.DoesNotExist:
        return json_response(error='History not found')

    history.delete()
    return json_response(data={'message': '删除成功'})


@auth('database.instance.backup_download')
def backup_download(request, instance_id, backup_id):
    from django.http import FileResponse
    try:
        backup = DatabaseBackup.objects.get(pk=backup_id, instance_id=instance_id)
    except DatabaseBackup.DoesNotExist:
        return json_response(error='Backup not found')

    if not backup.file_path or not os.path.exists(backup.file_path):
        return json_response(error='备份文件不存在')

    filename = os.path.basename(backup.file_path)
    response = FileResponse(open(backup.file_path, 'rb'), as_attachment=True, filename=filename)
    return response


@csrf_exempt
@auth('database.instance.view')
def backup_list(request, instance_id):
    if request.method == 'GET':
        try:
            instance = DatabaseInstance.objects.get(pk=instance_id)
        except ObjectDoesNotExist:
            return json_response(error='Instance not found')

        page = int(request.GET.get('page', 1))
        page_size = min(int(request.GET.get('page_size', 20)), 100)
        queryset = DatabaseBackup.objects.filter(instance=instance)
        total = queryset.count()
        rows = queryset[(page - 1) * page_size:page * page_size]
        data = []
        for b in rows:
            d = b.to_dict()
            d['created_by_name'] = b.created_by.username if b.created_by else None
            data.append(d)
        return json_response({'total': total, 'results': data})

    elif request.method == 'POST':
        if not request.user.has_perms(['database.instance.backup_add']):
            return json_response(error='权限拒绝')
        try:
            instance = DatabaseInstance.objects.get(pk=instance_id)
        except ObjectDoesNotExist:
            return json_response(error='Instance not found')

        data = json.loads(request.body) if request.content_type == 'application/json' else {}
        database = data.get('database') or None
        mode = data.get('mode', 'full')
        remark = data.get('remark', '')

        creator = BACKUP_CREATORS.get(instance.type)
        if not creator:
            return json_response(error=f'Backup not supported for type: {instance.type}')

        backup = DatabaseBackup.objects.create(
            instance=instance,
            database=database,
            mode=mode,
            status='running',
            remark=remark,
            created_by=request.user,
        )

        try:
            filepath, file_size, duration = creator(instance, database=database)
            backup.file_path = filepath
            backup.file_size = file_size
            backup.duration = duration
            backup.status = 'success'
            backup.save()
            return json_response(backup.to_dict())
        except Exception as e:
            backup.status = 'failed'
            backup.error_message = str(e)[:500]
            backup.save()
            return json_response(error=f'备份失败: {str(e)}')

    return json_response(error='Method not allowed')


@csrf_exempt
@auth('database.instance.view')
def backup_detail(request, instance_id, backup_id):
    try:
        backup = DatabaseBackup.objects.get(pk=backup_id, instance_id=instance_id)
    except DatabaseBackup.DoesNotExist:
        return json_response(error='Backup not found')

    if request.method == 'DELETE':
        if not request.user.has_perms(['database.instance.backup_del']):
            return json_response(error='权限拒绝')
        if backup.file_path and os.path.exists(backup.file_path):
            os.remove(backup.file_path)
        backup.delete()
        return json_response(data={'message': '删除成功'})

    return json_response(error='Method not allowed')


@csrf_exempt
@auth('database.instance.view')
def topology(request):
    if request.method != 'GET':
        return json_response(error='Method not allowed')

    instances = DatabaseInstance.objects.all()
    nodes = []
    edges = []
    seen_external = set()
    existing_edges = set()

    def _match_instance(target_host, target_port, source_inst):
        for other in instances:
            if other.host == target_host and other.port == target_port:
                return other
        if target_host in ("localhost", "127.0.0.1", "0.0.0.0"):
            for other in instances:
                if other.host == source_inst.host and other.port == target_port and other.id != source_inst.id:
                    return other
        return None

    def _add_edge(source, target, label, edge_type, status, delay=None):
        key = f"{source}->{target}"
        if key in existing_edges:
            return
        existing_edges.add(key)
        edge = {"source": source, "target": target, "label": label, "type": edge_type, "status": status}
        if delay is not None:
            edge["delay"] = delay
        edges.append(edge)

    for inst in instances:
        node_id = f"instance_{inst.id}"
        node = {
            "id": node_id,
            "instance_id": inst.id,
            "name": inst.name,
            "type": inst.type,
            "role": "standalone",
            "host": inst.host,
            "port": inst.port,
            "status": inst.status,
            "version": inst.version or "",
            "cluster": inst.cluster or None,
        }

        fetcher = REPLICATION_FETCHERS.get(inst.type)
        if fetcher:
            try:
                repl_info = fetcher(inst.host, inst.port, inst.username, inst.password)
                node["role"] = repl_info.get("role", "standalone")

                if repl_info.get("role") == "slave":
                    node["replication"] = {
                        "status": repl_info.get("replication_status", "unknown"),
                        "delay": repl_info.get("seconds_behind"),
                        "io_running": repl_info.get("io_running", False),
                        "sql_running": repl_info.get("sql_running", False),
                    }
                    master_host = repl_info.get("master_host", "")
                    master_port = repl_info.get("master_port", 0)
                    matched_inst = _match_instance(master_host, master_port, inst)
                    if matched_inst:
                        _add_edge(
                            f"instance_{matched_inst.id}", node_id,
                            "主从复制", "master_slave",
                            repl_info.get("replication_status", "unknown"),
                            repl_info.get("seconds_behind"),
                        )
                    elif master_host:
                        ext_id = f"external_{master_host}:{master_port}"
                        _add_edge(ext_id, node_id, "主从复制", "master_slave",
                                  repl_info.get("replication_status", "unknown"),
                                  repl_info.get("seconds_behind"))
                        if ext_id not in seen_external:
                            seen_external.add(ext_id)
                            nodes.append({
                                "id": ext_id, "name": f"{master_host}:{master_port}",
                                "type": inst.type, "role": "master",
                                "host": master_host, "port": master_port,
                                "status": -1, "version": "", "external": True,
                            })

                elif repl_info.get("role") == "master":
                    node["replication"] = {
                        "binlog_file": repl_info.get("master_status", {}).get("file", ""),
                        "binlog_pos": repl_info.get("master_status", {}).get("position", 0),
                        "slave_count": len(repl_info.get("slaves", [])),
                    }
                    for slave_info in repl_info.get("slaves", []):
                        slave_host = slave_info.get("host", "")
                        slave_port = slave_info.get("port", 0)
                        matched_inst = _match_instance(slave_host, slave_port, inst)
                        if matched_inst:
                            _add_edge(node_id, f"instance_{matched_inst.id}",
                                      "主从复制", "master_slave",
                                      "running" if slave_info.get("state") == "online" else "stopped")

            except Exception:
                pass

        nodes.append(node)

    cluster_map = {}
    for node in nodes:
        c = node.get("cluster")
        if c:
            if c not in cluster_map:
                cluster_map[c] = []
            cluster_map[c].append(node["id"])

    for edge in edges:
        src_node = next((n for n in nodes if n["id"] == edge["source"]), None)
        tgt_node = next((n for n in nodes if n["id"] == edge["target"]), None)
        if src_node and tgt_node:
            src_cluster = src_node.get("cluster")
            tgt_cluster = tgt_node.get("cluster")
            if src_cluster and not tgt_cluster:
                tgt_node["cluster"] = src_cluster
                if src_cluster not in cluster_map:
                    cluster_map[src_cluster] = []
                cluster_map[src_cluster].append(tgt_node["id"])
            elif tgt_cluster and not src_cluster:
                src_node["cluster"] = tgt_cluster
                if tgt_cluster not in cluster_map:
                    cluster_map[tgt_cluster] = []
                cluster_map[tgt_cluster].append(src_node["id"])

    return json_response({"nodes": nodes, "edges": edges, "clusters": cluster_map})
