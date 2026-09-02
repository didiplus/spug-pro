# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from apps.account.models import User
from libs import ModelMixin, human_datetime
from libs.crypto import encrypt, decrypt, is_encrypted
from libs.fields import EncryptedTextField
import json

KEYS_DEFAULT = {
    "MFA": {"enable": False},
    "verify_ip": True,
    "bind_ip": True,
    "ldap_service": {},
    "spug_key": None,
    "api_key": None,
    "mail_service": {},
    "private_key": None,
    "public_key": None,
    "spug_push_key": None,
    "exec_engine": "paramiko",
    "ansible_forks": 20,
    "ansible_strategy": "linear",
    "ansible_gather_facts": False,
    "ansible_fact_caching": True,
    "ansible_vault_password": None,
    "ansible_role_dir": "/data/roles",
    "ansible_module_timeout": 300,
    "ansible_callback_whitelist": "",

}

SENSITIVE_KEYS = {
    "private_key",
    "spug_push_key",
    "api_key",
    "spug_key",
    "ansible_vault_password",
}


class Setting(models.Model, ModelMixin):
    key = models.CharField(max_length=50, unique=True, verbose_name="配置键")
    value = models.TextField(verbose_name="配置值")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")

    def to_view(self):
        tmp = self.to_dict(selects=("key",))
        tmp["value"] = self.real_val
        return tmp

    @property
    def real_val(self):
        if self.value:
            raw = self.value
            if self.key in SENSITIVE_KEYS and is_encrypted(raw):
                raw = decrypt(raw)
            if raw is None:
                return KEYS_DEFAULT.get(self.key)
            return json.loads(raw)
        else:
            return KEYS_DEFAULT.get(self.key)

    def __repr__(self):
        return "<Setting %r>" % self.key

    class Meta:
        db_table = "settings"


class UserSetting(models.Model, ModelMixin):
    user = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="用户")
    key = models.CharField(max_length=32, verbose_name="配置键")
    value = models.TextField(verbose_name="配置值")

    class Meta:
        db_table = "user_settings"
        constraints = [
            models.UniqueConstraint(fields=["user", "key"], name="unique_user_key"),
        ]


class Menu(models.Model, ModelMixin):
    MENU_TYPES = [('M', '目录'), ('C', '菜单'), ('F', '按钮')]

    parent_id = models.BigIntegerField(default=0, verbose_name="父菜单ID")
    menu_name = models.CharField(max_length=50, verbose_name="菜单名称")
    menu_type = models.CharField(max_length=1, choices=MENU_TYPES, default='C', verbose_name="菜单类型")
    order_num = models.IntegerField(default=0, verbose_name="排序")
    path = models.CharField(max_length=200, null=True, verbose_name="路由路径")
    component = models.CharField(max_length=255, null=True, verbose_name="组件路径")
    query = models.CharField(max_length=255, null=True, verbose_name="查询参数")
    is_frame = models.IntegerField(default=1, verbose_name="是否外链")
    is_cache = models.IntegerField(default=0, verbose_name="是否缓存")
    visible = models.CharField(max_length=1, default='0', verbose_name="是否可见")
    status = models.CharField(max_length=1, default='0', verbose_name="状态")
    perms = models.CharField(max_length=200, null=True, verbose_name="权限标识")
    icon = models.CharField(max_length=100, null=True, verbose_name="图标")
    remark = models.CharField(max_length=500, null=True, verbose_name="备注")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="+", verbose_name="创建人")
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="+", verbose_name="更新人")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")

    def to_view(self):
        return self.to_dict()

    class Meta:
        db_table = "system_menu"
        ordering = ("order_num",)


class StorageConfig(models.Model, ModelMixin):
    STORAGE_TYPES = (
        ("s3", "S3 兼容存储"),
        ("oss", "阿里云 OSS"),
        ("cos", "腾讯云 COS"),
        ("obs", "华为云 OBS"),
    )

    name = models.CharField(max_length=100, unique=True, verbose_name="配置名称")
    storage_type = models.CharField(max_length=20, choices=STORAGE_TYPES, default="s3", verbose_name="存储类型")
    endpoint_url = models.CharField(max_length=255, null=True, blank=True, verbose_name="Endpoint URL")
    region = models.CharField(max_length=50, null=True, blank=True, verbose_name="区域")
    bucket = models.CharField(max_length=100, verbose_name="Bucket")
    prefix = models.CharField(max_length=255, null=True, blank=True, verbose_name="路径前缀")
    access_key = models.CharField(max_length=255, verbose_name="AccessKey")
    secret_key = EncryptedTextField(verbose_name="SecretKey")
    extra = models.TextField(default="{}", verbose_name="扩展配置")
    is_default = models.BooleanField(default=False, verbose_name="默认存储")
    enabled = models.BooleanField(default=True, verbose_name="启用状态")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", null=True, blank=True, verbose_name="创建人")

    class Meta:
        db_table = "system_storage_config"

    def to_dict(self, *args, **kwargs):
        data = super().to_dict(*args, **kwargs)
        data.pop('secret_key', None)
        data['has_secret'] = bool(self.secret_key)
        return data
