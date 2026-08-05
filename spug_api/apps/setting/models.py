# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from apps.account.models import User
from libs import ModelMixin
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
}

SENSITIVE_KEYS = {
    "private_key",
    "spug_push_key",
    "api_key",
    "spug_key",
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
