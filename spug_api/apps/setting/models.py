# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from apps.account.models import User
from libs import ModelMixin, human_datetime
from libs.crypto import encrypt, decrypt, is_encrypted
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
    key = models.CharField(max_length=50, unique=True)
    value = models.TextField()
    desc = models.CharField(max_length=255, null=True)

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
            return json.loads(raw)
        else:
            return KEYS_DEFAULT.get(self.key)

    def __repr__(self):
        return "<Setting %r>" % self.key

    class Meta:
        db_table = "settings"


class UserSetting(models.Model, ModelMixin):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    key = models.CharField(max_length=32)
    value = models.TextField()

    class Meta:
        db_table = "user_settings"
        constraints = [
            models.UniqueConstraint(fields=["user", "key"], name="unique_user_key"),
        ]


class Menu(models.Model, ModelMixin):
    MENU_TYPES = [('M', '目录'), ('C', '菜单'), ('F', '按钮')]

    parent_id = models.BigIntegerField(default=0)
    menu_name = models.CharField(max_length=50)
    menu_type = models.CharField(max_length=1, choices=MENU_TYPES, default='C')
    order_num = models.IntegerField(default=0)
    path = models.CharField(max_length=200, null=True)
    component = models.CharField(max_length=255, null=True)
    query = models.CharField(max_length=255, null=True)
    is_frame = models.IntegerField(default=1)
    is_cache = models.IntegerField(default=0)
    visible = models.CharField(max_length=1, default='0')
    status = models.CharField(max_length=1, default='0')
    perms = models.CharField(max_length=200, null=True)
    icon = models.CharField(max_length=100, null=True)
    remark = models.CharField(max_length=500, null=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="+")
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="+")
    created_at = models.CharField(max_length=20, default=human_datetime)
    updated_at = models.CharField(max_length=20, null=True)

    def to_view(self):
        return self.to_dict()

    class Meta:
        db_table = "system_menu"
        ordering = ("order_num",)
