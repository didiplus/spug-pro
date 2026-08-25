# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
import django
from django.core.cache import cache
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from libs import JsonParser, Argument, json_response, auth, human_datetime
from libs.utils import generate_random_str
from django.views.generic import View
from libs.mail import Mail
from libs.push import get_balance, send_login_code
from libs.mixins import AdminView
from apps.setting.utils import AppSetting
from apps.setting.models import Setting, KEYS_DEFAULT
from copy import deepcopy
import platform
import ldap


class SettingView(AdminView):
    def get(self, request):
        response = deepcopy(KEYS_DEFAULT)
        for item in Setting.objects.all():
            if item.key == 'spug_push_key':
                response[item.key] = f'{item.real_val[:8]}********{item.real_val[-8:]}'
            else:
                response[item.key] = item.real_val
        return json_response(response)

    def post(self, request):
        form, error = JsonParser(
            Argument('data', type=list, help='缺少必要的参数')
        ).parse(request.body)
        if error is None:
            for item in form.data:
                AppSetting.set(**item)
        return json_response(error=error)


class MFAView(AdminView):
    def get(self, request):
        if not request.user.wx_token:
            return json_response(
                error='检测到当前账户未配置推送标识（账户管理/编辑），请配置后再尝试启用MFA认证，否则可能造成系统无法正常登录。')
        spug_push_key = AppSetting.get_default('spug_push_key')
        if not spug_push_key:
            return json_response(error='检测到当前账户未绑定推送服务，请在系统设置/推送服务设置中绑定推送助手账户。')
        code = generate_random_str(6)
        send_login_code(spug_push_key, request.user.wx_token, code)
        cache.set(f'{request.user.username}:code', code, 300)
        return json_response()

    def post(self, request):
        form, error = JsonParser(
            Argument('enable', type=bool, help='参数错误'),
            Argument('code', required=False)
        ).parse(request.body)
        if error is None:
            if form.enable:
                if not form.code:
                    return json_response(error='请输入验证码')
                key = f'{request.user.username}:code'
                code = cache.get(key)
                if not code:
                    return json_response(error='验证码已失效，请重新获取')
                if code != form.code:
                    ttl = cache.ttl(key)
                    cache.expire(key, ttl - 100)
                    return json_response(error='验证码错误')
                cache.delete(key)
            AppSetting.set('MFA', {'enable': form.enable})
        return json_response(error=error)


@auth('admin')
def ldap_test(request):
    form, error = JsonParser(
        Argument('server'),
        Argument('port', type=int),
        Argument('admin_dn'),
        Argument('password'),
    ).parse(request.body)
    if error is None:
        try:
            con = ldap.initialize("ldap://{0}:{1}".format(form.server, form.port), bytes_mode=False)
            con.simple_bind_s(form.admin_dn, form.password)
            return json_response()
        except Exception as e:
            # 使用安全的方式解析 LDAP 异常信息，避免 eval()
            error_msg = str(e)
            try:
                # 尝试安全的 JSON 解析（如果异常信息是 JSON 格式）
                import json
                error_data = json.loads(error_msg)
                if isinstance(error_data, dict) and 'desc' in error_data:
                    return json_response(error=error_data['desc'])
            except (json.JSONDecodeError, TypeError, KeyError):
                pass
            # 如果无法解析，返回原始错误信息
            return json_response(error=error_msg)
    return json_response(error=error)


@auth('admin')
def email_test(request):
    form, error = JsonParser(
        Argument('server', help='请输入邮件服务地址'),
        Argument('port', type=int, help='请输入邮件服务端口号'),
        Argument('username', help='请输入邮箱账号'),
        Argument('password', help='请输入密码/授权码'),
    ).parse(request.body)
    if error is None:
        try:
            mail = Mail(**form)
            server = mail.get_server()
            server.quit()
            return json_response()
        except Exception as e:
            error = f'{e}'
    return json_response(error=error)


@auth('admin')
def get_about(request):
    return json_response({
        'python_version': platform.python_version(),
        'system_version': platform.platform(),
        'spug_version': settings.SPUG_VERSION,
        'django_version': django.get_version()
    })


@auth('admin')
def handle_push_bind(request):
    form, error = JsonParser(
        Argument('spug_push_key', required=False),
    ).parse(request.body)
    if error is None:
        if not form.spug_push_key:
            AppSetting.delete('spug_push_key')
            return json_response()

        try:
            res = get_balance(form.spug_push_key)
        except Exception as e:
            return json_response(error=f'绑定失败：{e}')

        AppSetting.set('spug_push_key', form.spug_push_key)
        return json_response(res)
    return json_response(error=error)


@auth('admin')
def handle_push_balance(request):
    token = AppSetting.get_default('spug_push_key')
    if not token:
        return json_response(error='请先配置推送服务绑定账户')
    res = get_balance(token)
    return json_response(res)


def _build_menu_tree(menus, parent_id=0):
    tree = []
    for m in menus:
        if m.parent_id == parent_id:
            node = m.to_view()
            children = _build_menu_tree(menus, m.id)
            if children:
                node['children'] = children
            tree.append(node)
    return tree


class MenuView(View):
    def get(self, request):
        from apps.setting.models import Menu
        menus = Menu.objects.filter(status='0').order_by('order_num')
        if not request.user.is_supper:
            user_perms = request.user.page_perms
            filtered = []
            for m in menus:
                if not m.perms:
                    filtered.append(m)
                else:
                    codes = [c.strip() for c in m.perms.split('|')]
                    if user_perms.intersection(codes):
                        filtered.append(m)
            menus = filtered
        tree = _build_menu_tree(list(menus))
        return json_response(tree)


class MenuManageView(AdminView):
    def get(self, request):
        from apps.setting.models import Menu
        menus = Menu.objects.all().order_by('order_num')
        tree = _build_menu_tree(list(menus))
        return json_response(tree)

    def post(self, request):
        from apps.setting.models import Menu
        form, error = JsonParser(
            Argument('menu_name', help='请输入菜单名称'),
            Argument('menu_type', default='C'),
            Argument('parent_id', type=int, default=0),
            Argument('order_num', type=int, default=0),
            Argument('path', required=False),
            Argument('component', required=False),
            Argument('perms', required=False),
            Argument('icon', required=False),
            Argument('visible', default='0'),
            Argument('is_frame', type=int, default=1),
            Argument('is_cache', type=int, default=0),
            Argument('remark', required=False),
        ).parse(request.body)
        if error is None:
            Menu.objects.create(
                menu_name=form.menu_name, menu_type=form.menu_type,
                parent_id=form.parent_id, order_num=form.order_num,
                path=form.path, component=form.component, perms=form.perms,
                icon=form.icon, visible=form.visible, is_frame=form.is_frame,
                is_cache=form.is_cache, remark=form.remark, created_by=request.user,
            )
        return json_response(error=error)

    def patch(self, request):
        from apps.setting.models import Menu
        form, error = JsonParser(
            Argument('id', type=int, help='请指定菜单'),
            Argument('menu_name', required=False),
            Argument('menu_type', required=False),
            Argument('parent_id', type=int, required=False),
            Argument('order_num', type=int, required=False),
            Argument('path', required=False),
            Argument('component', required=False),
            Argument('perms', required=False),
            Argument('icon', required=False),
            Argument('visible', required=False),
            Argument('status', required=False),
            Argument('is_frame', type=int, required=False),
            Argument('is_cache', type=int, required=False),
            Argument('remark', required=False),
        ).parse(request.body, True)
        if error is None:
            updates = {}
            for k in ('menu_name', 'menu_type', 'parent_id', 'order_num', 'path',
                      'component', 'perms', 'icon', 'visible', 'status',
                      'is_frame', 'is_cache', 'remark'):
                if form.get(k) is not None:
                    updates[k] = form[k]
            if updates:
                updates['updated_at'] = human_datetime()
                updates['updated_by_id'] = request.user.id
                Menu.objects.filter(pk=form.id).update(**updates)
        return json_response(error=error)

    def delete(self, request):
        from apps.setting.models import Menu
        form, error = JsonParser(
            Argument('id', type=int, help='请指定菜单'),
        ).parse(request.GET)
        if error is None:
            menu = Menu.objects.filter(pk=form.id).first()
            if not menu:
                return json_response(error='菜单不存在')
            count = self._delete_with_children(Menu, form.id)
            if count > 1:
                return json_response({'deleted_count': count})
        return json_response(error=error)

    @staticmethod
    def _delete_with_children(Menu, menu_id):
        count = 0
        children = Menu.objects.filter(parent_id=menu_id)
        for child in children:
            count += MenuManageView._delete_with_children(Menu, child.id)
        Menu.objects.filter(pk=menu_id).delete()
        count += 1
        return count


class StorageConfigView(AdminView):
    def get(self, request):
        from apps.setting.models import StorageConfig
        configs = StorageConfig.objects.all().order_by('-id')
        return json_response([c.to_dict() for c in configs])

    def post(self, request):
        from apps.setting.models import StorageConfig
        import json
        data = json.loads(request.body) if request.content_type == 'application/json' else {}
        required = ['name', 'bucket', 'access_key', 'secret_key']
        missing = [f for f in required if not data.get(f)]
        if missing:
            return json_response(error=f'Missing fields: {", ".join(missing)}')

        if StorageConfig.objects.filter(name=data['name']).exists():
            return json_response(error='存储配置名称已存在')

        config = StorageConfig.objects.create(
            name=data['name'],
            storage_type=data.get('storage_type', 's3'),
            endpoint_url=data.get('endpoint_url') or None,
            region=data.get('region') or None,
            bucket=data['bucket'],
            prefix=data.get('prefix') or None,
            access_key=data['access_key'],
            secret_key=data['secret_key'],
            is_default=bool(data.get('is_default', False)),
            enabled=bool(data.get('enabled', True)),
            created_by=request.user,
        )
        if config.is_default:
            StorageConfig.objects.exclude(pk=config.pk).update(is_default=False)
        return json_response(config.to_dict())


class StorageConfigDetailView(AdminView):
    def get(self, request, config_id):
        from apps.setting.models import StorageConfig
        try:
            config = StorageConfig.objects.get(pk=config_id)
        except StorageConfig.DoesNotExist:
            return json_response(error='Storage config not found')
        return json_response(config.to_dict())

    def put(self, request, config_id):
        from apps.setting.models import StorageConfig
        import json
        try:
            config = StorageConfig.objects.get(pk=config_id)
        except StorageConfig.DoesNotExist:
            return json_response(error='Storage config not found')
        data = json.loads(request.body) if request.content_type == 'application/json' else {}
        config.name = data.get('name', config.name)
        config.endpoint_url = data.get('endpoint_url') or None
        config.region = data.get('region') or None
        config.bucket = data.get('bucket', config.bucket)
        config.prefix = data.get('prefix') or None
        config.access_key = data.get('access_key', config.access_key)
        if data.get('secret_key'):
            config.secret_key = data['secret_key']
        config.is_default = bool(data.get('is_default', config.is_default))
        config.enabled = bool(data.get('enabled', config.enabled))
        config.updated_at = human_datetime()
        config.save()
        if config.is_default:
            StorageConfig.objects.exclude(pk=config.pk).update(is_default=False)
        return json_response(config.to_dict())

    def delete(self, request, config_id):
        from apps.setting.models import StorageConfig
        from apps.database.models import DatabaseBackup
        try:
            config = StorageConfig.objects.get(pk=config_id)
        except StorageConfig.DoesNotExist:
            return json_response(error='Storage config not found')
        if DatabaseBackup.objects.filter(storage_config=config).exists():
            return json_response(error='该存储配置被备份记录引用，无法删除')
        config.delete()
        return json_response(data={'message': '删除成功'})


@csrf_exempt
@auth('admin')
def test_storage(request):
    import json
    if request.method != 'POST':
        return json_response(error='Method not allowed')
    data = json.loads(request.body) if request.content_type == 'application/json' else {}
    from apps.setting.storage_backends import test_s3_connection
    config = {
        'endpoint_url': data.get('endpoint_url') or None,
        'access_key': data.get('access_key'),
        'secret_key': data.get('secret_key'),
        'region': data.get('region') or None,
        'bucket': data.get('bucket'),
        'prefix': data.get('prefix'),
    }
    result = test_s3_connection(config)
    return json_response(result)
