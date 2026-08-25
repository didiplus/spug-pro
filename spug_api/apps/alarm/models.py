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
    name = models.CharField(max_length=50, verbose_name="告警名称")
    type = models.CharField(max_length=50, verbose_name="告警类型")
    target = models.CharField(max_length=100, verbose_name="目标")
    notify_mode = models.JSONField(default=list, verbose_name="通知方式")
    notify_grp = models.JSONField(default=list, verbose_name="通知组")
    status = models.CharField(max_length=2, choices=STATUS, verbose_name="状态")
    duration = models.CharField(max_length=50, verbose_name="持续时间")
    fingerprint = models.CharField(max_length=64, db_index=True, null=True, verbose_name="指纹")
    is_escalated = models.BooleanField(default=False, verbose_name="是否已升级")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")

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
    name = models.CharField(max_length=50, verbose_name="策略名称")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    silence_window = models.IntegerField(default=30, verbose_name="静默窗口(分钟)")
    escalate_after = models.IntegerField(null=True, verbose_name="升级时间(分钟)")
    escalate_to = models.JSONField(default=list, verbose_name="升级到")
    repeat_interval = models.IntegerField(null=True, verbose_name="重复间隔(分钟)")
    is_active = models.BooleanField(default=True, verbose_name="启用状态")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")

    def to_dict(self, *args, **kwargs):
        return super().to_dict(*args, **kwargs)

    def __repr__(self):
        return "<AlarmPolicy %r>" % self.name

    class Meta:
        db_table = "alarm_policies"
        ordering = ("-id",)


class Group(models.Model, ModelMixin):
    name = models.CharField(max_length=50, verbose_name="组名称")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    contacts = models.JSONField(default=list, verbose_name="联系人")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")

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
    name = models.CharField(max_length=50, verbose_name="联系人姓名")
    phone = models.CharField(max_length=20, null=True, verbose_name="手机号")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")

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
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name="channels", verbose_name="联系人")
    type = models.CharField(max_length=20, choices=TYPES, verbose_name="渠道类型")
    identifier = EncryptedTextField(verbose_name="标识符")
    secret = EncryptedTextField(null=True, verbose_name="密钥")

    def __repr__(self):
        return "<ContactChannel %r>" % self.type

    class Meta:
        db_table = "alarm_contact_channels"
        ordering = ("id",)
        unique_together = ("contact", "type")
