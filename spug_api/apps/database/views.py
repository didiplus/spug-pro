from django.views.generic import View
from django.views.decorators.http import require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt
import json
import os
import uuid
from threading import Thread
from apps.database.utils import TEST_FETCHERS, DETAIL_FETCHERS, SQL_EXECUTORS, SLOW_QUERY_FETCHERS, BACKUP_CREATORS, run_backup_async, cleanup_old_backups, discover_topology, auto_discover_clusters, run_health_check, check_instance
from apps.database.models import DatabaseInstance, DatabaseBackup, SQLExecutionHistory, RetentionPolicy, DatabaseCluster
from apps.setting.models import StorageConfig
from django.core.exceptions import ObjectDoesNotExist
from django.utils.decorators import method_decorator
from libs import json_response, human_datetime
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
            return None, json_response(error="Invalid JSON")

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
            from django.db.models import Q
            queryset = DatabaseInstance.objects.all()
            search = request.GET.get('search', '').strip()
            if search:
                queryset = queryset.filter(Q(name__icontains=search) | Q(host__icontains=search))
            db_type = request.GET.get('type', '').strip()
            if db_type:
                queryset = queryset.filter(type=db_type)
            status = request.GET.get('status', '').strip()
            if status:
                queryset = queryset.filter(status=int(status))
            data = [self._serialize(inst) for inst in queryset]
            online = queryset.filter(status=0).count()
            type_counts = {}
            for inst in queryset:
                type_counts[inst.type] = type_counts.get(inst.type, 0) + 1
            return json_response({
                'count': len(data),
                'results': data,
                'online': online,
                'type_counts': type_counts,
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

        required = ['name', 'type', 'host', 'port', 'username']
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
    sql_clean = re.sub(r'/\*!\d*.*?\*/', '', sql_clean, flags=re.DOTALL)
    sql_clean = re.sub(r'\s+', ' ', sql_clean).strip()
    if ';' in sql_clean.rstrip(';'):
        return json_response(error='禁止执行多条语句（检测到分号）')
    tokens = re.findall(r"[a-zA-Z_]+", sql_clean)

    DANGEROUS_KEYWORDS = {
        'drop', 'truncate', 'shutdown', 'kill', 'alter', 'grant', 'revoke',
        'load_file', 'outfile', 'dumpfile', 'rename',
        'merge', 'call', 'exec', 'execute',
        'handler', 'flush', 'reset', 'purge',
    }
    for token in tokens:
        if token in DANGEROUS_KEYWORDS:
            return json_response(error=f'包含危险关键字: {token}，禁止执行')

    ALLOWED_COMMANDS = {'select', 'show', 'describe', 'desc', 'explain', 'with'}
    first_word = tokens[0] if tokens else ''
    if first_word not in ALLOWED_COMMANDS:
        return json_response(error='仅允许执行查询类语句 (SELECT, SHOW, DESCRIBE, EXPLAIN, WITH)')

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
    import tempfile
    try:
        backup = DatabaseBackup.objects.get(pk=backup_id, instance_id=instance_id)
    except DatabaseBackup.DoesNotExist:
        return json_response(error='Backup not found')

    if backup.file_path and os.path.exists(backup.file_path):
        filename = os.path.basename(backup.file_path)
        response = FileResponse(open(backup.file_path, 'rb'), as_attachment=True, filename=filename)
        return response

    if backup.remote_path and backup.storage_config and backup.storage_config.enabled:
        try:
            from apps.setting.storage_backends import download_from_remote, build_config_from_model
            config = build_config_from_model(backup.storage_config)
            filename = os.path.basename(backup.remote_path)
            tmp_fd, tmp_path = tempfile.mkstemp(suffix=f'_{filename}')
            os.close(tmp_fd)
            download_from_remote(config, backup.remote_path, tmp_path)

            def _stream_and_cleanup(path):
                try:
                    with open(path, 'rb') as f:
                        while True:
                            chunk = f.read(8192)
                            if not chunk:
                                break
                            yield chunk
                finally:
                    try:
                        os.remove(path)
                    except OSError:
                        pass

            response = FileResponse(_stream_and_cleanup(tmp_path), as_attachment=True, filename=filename)
            response['Content-Length'] = os.path.getsize(tmp_path)
            return response
        except Exception as e:
            return json_response(error=f'从远程存储下载失败: {str(e)}')

    return json_response(error='备份文件不存在')


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
        storage_config_id = data.get('storage_config_id')

        storage_config = None
        if storage_config_id:
            try:
                storage_config = StorageConfig.objects.get(pk=storage_config_id, enabled=True)
            except StorageConfig.DoesNotExist:
                return json_response(error='指定的存储配置不存在或未启用')

        creator = BACKUP_CREATORS.get(instance.type)
        if not creator:
            return json_response(error=f'Backup not supported for type: {instance.type}')

        task_id = uuid.uuid4().hex
        backup = DatabaseBackup.objects.create(
            instance=instance,
            database=database,
            mode=mode,
            status='pending',
            storage_config=storage_config,
            remark=remark,
            task_id=task_id,
            created_by=request.user,
        )

        Thread(target=run_backup_async, args=(backup.id,), daemon=True).start()
        return json_response(backup.to_dict())

    return json_response(error='Method not allowed')


@csrf_exempt
@auth('database.instance.view')
def backup_status(request, instance_id, backup_id):
    try:
        backup = DatabaseBackup.objects.get(pk=backup_id, instance_id=instance_id)
    except DatabaseBackup.DoesNotExist:
        return json_response(error='Backup not found')
    data = backup.to_dict()
    data['progress'] = backup.progress
    data['status'] = backup.status
    return json_response(data)


@csrf_exempt
@auth('database.instance.view')
def retention_policy(request, instance_id):
    try:
        instance = DatabaseInstance.objects.get(pk=instance_id)
    except ObjectDoesNotExist:
        return json_response(error='Instance not found')

    if request.method == 'GET':
        policy = RetentionPolicy.objects.filter(instance=instance).first()
        if not policy:
            return json_response(data=None)
        return json_response(policy.to_dict())

    elif request.method == 'POST':
        if not request.user.has_perms(['database.instance.backup_add']):
            return json_response(error='权限拒绝')
        data = json.loads(request.body) if request.content_type == 'application/json' else {}
        policy, _created = RetentionPolicy.objects.get_or_create(instance=instance)
        policy.strategy_type = data.get('strategy_type', 'count')
        policy.keep_count = int(data.get('keep_count', 30))
        policy.keep_days = int(data.get('keep_days', 7))
        policy.keep_weekly = int(data.get('keep_weekly', 4))
        policy.keep_monthly = int(data.get('keep_monthly', 12))
        policy.enabled = bool(data.get('enabled', True))
        policy.auto_cleanup = bool(data.get('auto_cleanup', True))
        policy.save()
        return json_response(policy.to_dict())

    elif request.method == 'DELETE':
        if not request.user.has_perms(['database.instance.backup_del']):
            return json_response(error='权限拒绝')
        RetentionPolicy.objects.filter(instance=instance).delete()
        return json_response(data={'message': '保留策略已删除'})

    return json_response(error='Method not allowed')


@csrf_exempt
@auth('database.instance.view')
def cleanup_backups(request, instance_id):
    if request.method == 'POST':
        if not request.user.has_perms(['database.instance.backup_del']):
            return json_response(error='权限拒绝')
        try:
            instance = DatabaseInstance.objects.get(pk=instance_id)
        except ObjectDoesNotExist:
            return json_response(error='Instance not found')
        deleted = cleanup_old_backups(instance)
        return json_response(data={'deleted': deleted})
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
            try:
                os.remove(backup.file_path)
            except OSError:
                pass
        if backup.remote_path and backup.storage_config and backup.storage_config.enabled:
            try:
                from apps.setting.storage_backends import delete_from_remote, build_config_from_model
                config = build_config_from_model(backup.storage_config)
                delete_from_remote(config, backup.remote_path)
            except Exception:
                pass
        backup.delete()
        return json_response(data={'message': '删除成功'})

    return json_response(error='Method not allowed')


# ==================== 集群拓扑管理 ====================

@csrf_exempt
@auth('database.instance.view')
@require_GET
def cluster_list(request):
    """集群列表 — 合并 DatabaseCluster 记录与按 cluster 字段动态分组的实例"""
    clusters = {}
    for inst in DatabaseInstance.objects.all().exclude(cluster__isnull=True).exclude(cluster=''):
        cname = inst.cluster
        if cname not in clusters:
            clusters[cname] = {'name': cname, 'db_type': inst.type, 'instances': [], 'online': 0}
        clusters[cname]['instances'].append(inst.id)
        if inst.status == 0:
            clusters[cname]['online'] += 1

    result = []
    for cname, info in clusters.items():
        try:
            record = DatabaseCluster.objects.get(name=cname)
            result.append({
                'name': cname,
                'db_type': info['db_type'],
                'topology_type': record.topology_type,
                'health_status': record.health_status,
                'node_count': record.node_count,
                'online': info['online'],
                'total': len(info['instances']),
                'last_discovered_at': record.last_discovered_at,
                'description': record.description,
            })
        except DatabaseCluster.DoesNotExist:
            result.append({
                'name': cname,
                'db_type': info['db_type'],
                'topology_type': 'unknown',
                'health_status': 'unknown',
                'node_count': len(info['instances']),
                'online': info['online'],
                'total': len(info['instances']),
                'last_discovered_at': None,
                'description': None,
            })

    standalone_count = DatabaseInstance.objects.filter(cluster__isnull=True).count() + \
        DatabaseInstance.objects.filter(cluster='').count()
    return json_response({
        'count': len(result),
        'results': result,
        'standalone_count': standalone_count,
    })


@csrf_exempt
@auth('database.instance.view')
@require_GET
def cluster_topology(request, cluster_name):
    """获取集群拓扑数据 — 60s 缓存"""
    import time
    cache_key = f'_topo_cache_{cluster_name}'
    cache = getattr(cluster_topology, '_cache', {})
    cached = cache.get(cache_key)
    if cached and time.time() - cached['ts'] < 10:
        return json_response(data=cached['data'])

    instances = list(DatabaseInstance.objects.filter(cluster=cluster_name).order_by('id'))
    if not instances:
        return json_response(error='集群不存在或无实例')

    topology = discover_topology(instances)
    if not topology:
        return json_response(error='拓扑发现失败')

    if not hasattr(cluster_topology, '_cache'):
        cluster_topology._cache = {}
    cluster_topology._cache[cache_key] = {'data': topology, 'ts': time.time()}
    return json_response(data=topology)


@csrf_exempt
@auth('database.instance.view')
def cluster_discover(request, cluster_name):
    """手动触发拓扑发现 — POST 执行发现并持久化结果"""
    if request.method != 'POST':
        return json_response(error='Method not allowed')

    instances = list(DatabaseInstance.objects.filter(cluster=cluster_name).order_by('id'))
    if not instances:
        return json_response(error='集群不存在或无实例')

    topology = discover_topology(instances)
    if not topology:
        return json_response(error='拓扑发现失败')

    for inst in instances:
        for node in topology['nodes']:
            if node['id'] == inst.id:
                inst.cluster_role = node['role']
                inst.cluster_parent_id = node.get('parent_id')
                inst.replication_lag = node['metrics'].get('lag')
                inst.save(update_fields=['cluster_role', 'cluster_parent_id', 'replication_lag'])
                break

    record, _ = DatabaseCluster.objects.update_or_create(
        name=cluster_name,
        defaults={
            'topology_type': topology['topology_type'],
            'db_type': topology['db_type'],
            'health_status': topology['health_status'],
            'node_count': topology['node_count'],
            'last_discovered_at': human_datetime(),
        },
    )

    topology['last_discovered_at'] = record.last_discovered_at

    cache = getattr(cluster_topology, '_cache', {})
    cache.pop(f'_topo_cache_{cluster_name}', None)

    return json_response(data=topology)


@csrf_exempt
@auth('database.instance.view')
@require_GET
def cluster_health(request, cluster_name):
    """集群健康检查 — 返回各节点状态与整体健康度"""
    instances = list(DatabaseInstance.objects.filter(cluster=cluster_name).order_by('id'))
    if not instances:
        return json_response(error='集群不存在或无实例')

    topology = discover_topology(instances)
    if not topology:
        return json_response(error='健康检查失败')

    nodes_health = []
    for node in topology['nodes']:
        nodes_health.append({
            'id': node['id'],
            'name': node['name'],
            'role': node['role'],
            'status': node['status'],
            'lag': node['metrics'].get('lag'),
            'version': node['metrics'].get('version'),
            'connections': node['metrics'].get('connections'),
        })

    return json_response({
        'cluster_name': cluster_name,
        'health_status': topology['health_status'],
        'topology_type': topology['topology_type'],
        'nodes': nodes_health,
    })


@csrf_exempt
@auth('database.instance.view')
def cluster_auto_discover(request):
    """自动发现集群 — 基于复制关系的连通分量分析

    POST: 触发自动发现，将结果写回实例的 cluster 字段
    GET: 返回自动发现的预览结果（不写回）
    """
    all_instances = list(DatabaseInstance.objects.all().order_by('id'))
    if not all_instances:
        return json_response(error='无数据库实例')

    cluster_map, standalone_ids, diagnostics = auto_discover_clusters(all_instances)

    if request.method == 'POST':
        id_to_instance = {inst.id: inst for inst in all_instances}
        updated = 0
        for cluster_name, inst_ids in cluster_map.items():
            for inst_id in inst_ids:
                inst = id_to_instance.get(inst_id)
                if not inst:
                    continue
                current = (inst.cluster or '').strip()
                if current != cluster_name:
                    inst.cluster = cluster_name
                    inst.save(update_fields=['cluster'])
                    updated += 1
        return json_response(data={
            'message': f'自动发现完成，更新 {updated} 个实例',
            'clusters': cluster_map,
            'standalone_count': len(standalone_ids),
            'updated_count': updated,
            'diagnostics': diagnostics,
        })

    result = []
    id_to_inst = {inst.id: inst for inst in all_instances}
    for cluster_name, inst_ids in cluster_map.items():
        insts = [id_to_inst[i] for i in inst_ids if i in id_to_inst]
        if not insts:
            continue
        online = sum(1 for i in insts if i.status == 0)
        result.append({
            'name': cluster_name,
            'db_type': insts[0].type,
            'topology_type': 'unknown',
            'health_status': 'unknown',
            'node_count': len(insts),
            'online': online,
            'total': len(insts),
            'last_discovered_at': None,
            'description': '自动发现' if cluster_name.startswith('auto-') else None,
        })

    return json_response(data={
        'count': len(result),
        'results': result,
        'standalone_count': len(standalone_ids),
    })


@csrf_exempt
@auth('database.instance.view')
@require_GET
def health_check(request):
    """批量健康检查所有实例 — 手动触发"""
    from threading import Thread
    Thread(target=run_health_check, daemon=True).start()
    return json_response(data={'message': '健康检查已启动'})


@csrf_exempt
@auth('database.instance.view')
@require_GET
def instance_test(request, instance_id):
    """测试单个实例连通性 — 返回实时结果"""
    instance, error = DatabaseInstanceView()._get_instance_or_404(instance_id)
    if error:
        return error
    is_online, version, latency = check_instance(instance)
    new_status = 0 if is_online else 1
    need_save = instance.status != new_status
    if version and version != instance.version:
        instance.version = version
        need_save = True
    if need_save:
        instance.status = new_status
        instance.save(update_fields=['status', 'version'])
    return json_response(data={
        'online': is_online,
        'status': new_status,
        'version': version or instance.version,
        'latency': latency,
    })


