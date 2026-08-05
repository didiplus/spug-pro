# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from libs import ModelMixin
from libs.fields import EncryptedTextField
from apps.account.models import User
import json
import hashlib


class Alarm(models.Model, ModelMixin):
    MODES = (
        ("1", "微信"),
        ("2", "短信"),
        ("3", "钉钉"),
        ("4", "邮件"),
        ("5", "企业微信"),
        ("6", "电话"),
        ("7", "飞书"),
    )
    STATUS = (
        ("1", "报警发生"),
        ("2", "故障恢复"),
    )
    name = models.CharField(max_length=50)
    type = models.CharField(max_length=50)
    target = models.CharField(max_length=100)
    notify_mode = models.JSONField(default=list)
    notify_grp = models.JSONField(default=list)
    status = models.CharField(max_length=2, choices=STATUS)
    duration = models.CharField(max_length=50)
    fingerprint = models.CharField(max_length=64, db_index=True, null=True)
    is_escalated = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def make_fingerprint(cls, name, target):
        raw = f"{name}:{target}"
        return hashlib.md5(raw.encode('utf-8')).hexdigest()

    def to_dict(self, *args, **kwargs):
        tmp = super().to_dict(*args, **kwargs)
        tmp["notify_mode"] = ",".join(
            dict(self.MODES)[x] for x in self.notify_mode
        )
        tmp["notify_grp"] = self.notify_grp
        tmp["status_alias"] = self.get_status_display()
        return tmp

    def __repr__(self):
        return "<Alarm %r>" % self.name

    class Meta:
        db_table = "alarms"
        ordering = ("-id",)


class AlarmPolicy(models.Model, ModelMixin):
    name = models.CharField(max_length=50)
    desc = models.CharField(max_length=255, null=True)
    silence_window = models.IntegerField(default=30)
    escalate_after = models.IntegerField(null=True)
    escalate_to = models.JSONField(default=list)
    repeat_interval = models.IntegerField(null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")

    def to_dict(self, *args, **kwargs):
        return super().to_dict(*args, **kwargs)

    def __repr__(self):
        return "<AlarmPolicy %r>" % self.name

    class Meta:
        db_table = "alarm_policies"
        ordering = ("-id",)


class Group(models.Model, ModelMixin):
    name = models.CharField(max_length=50)
    desc = models.CharField(max_length=255, null=True)
    contacts = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")

    def to_dict(self, *args, **kwargs):
        tmp = super().to_dict(*args, **kwargs)
        tmp["contacts"] = self.contacts or []
        return tmp

    def __repr__(self):
        return "<AlarmGroup %r>" % self.name

    class Meta:
        db_table = "alarm_groups"
        ordering = ("-id",)


class Contact(models.Model, ModelMixin):
    name = models.CharField(max_length=50)
    phone = models.CharField(max_length=20, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")

    def to_dict(self, *args, **kwargs):
        tmp = super().to_dict(*args, **kwargs)
        channels = {c.type: c for c in self.channels.all()}
        tmp["email"] = channels["email"].identifier if "email" in channels else None
        tmp["ding"] = channels["ding"].identifier if "ding" in channels else None
        tmp["wx_token"] = channels["wx_token"].identifier if "wx_token" in channels else None
        tmp["qy_wx"] = channels["qy_wx"].identifier if "qy_wx" in channels else None
        tmp["feishu"] = channels["feishu"].identifier if "feishu" in channels else None
        secret = {}
        if "ding" in channels and channels["ding"].secret:
            secret["ding"] = channels["ding"].secret
        if "feishu" in channels and channels["feishu"].secret:
            secret["feishu"] = channels["feishu"].secret
        tmp["secret"] = json.dumps(secret) if secret else None
        return tmp

    def __repr__(self):
        return "<AlarmContact %r>" % self.name

    class Meta:
        db_table = "alarm_contacts"
        ordering = ("-id",)


class ContactChannel(models.Model, ModelMixin):
    TYPES = (
        ("email", "邮箱"),
        ("ding", "钉钉"),
        ("wx_token", "微信"),
        ("qy_wx", "企业微信"),
        ("feishu", "飞书"),
    )
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name="channels")
    type = models.CharField(max_length=20, choices=TYPES)
    identifier = EncryptedTextField()
    secret = EncryptedTextField(null=True)

    def __repr__(self):
        return "<ContactChannel %r>" % self.type

    class Meta:
        db_table = "alarm_contact_channels"
        ordering = ("id",)
        unique_together = ("contact", "type")
