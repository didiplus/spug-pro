# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from libs import ModelMixin, human_datetime
from apps.account.models import User
import json


class Playbook(models.Model, ModelMixin):
    """Ansible Playbook 定义"""
    name = models.CharField(max_length=100)
    desc = models.CharField(max_length=255, null=True)
    content = models.TextField()
    extra_vars = models.TextField(default="{}")
    host_pattern = models.CharField(max_length=200, default="all")
    group_id = models.IntegerField(null=True)
    tags = models.CharField(max_length=255, null=True)
    forks = models.IntegerField(default=0)
    timeout = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.CharField(max_length=20, default=human_datetime)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    updated_at = models.CharField(max_length=20, null=True)
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", null=True)

    def to_view(self):
        tmp = self.to_dict()
        tmp["extra_vars"] = json.loads(self.extra_vars) if self.extra_vars else {}
        return tmp

    class Meta:
        db_table = "playbook"
        ordering = ("-id",)


class PlaybookRun(models.Model, ModelMixin):
    """Playbook 执行记录"""
    STATUS_CHOICES = (
        ("running", "执行中"),
        ("success", "成功"),
        ("failed", "失败"),
        ("canceled", "已取消"),
    )
    playbook = models.ForeignKey(Playbook, on_delete=models.CASCADE, related_name="runs")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+")
    token = models.CharField(max_length=32, db_index=True)
    host_ids = models.TextField()
    extra_vars = models.TextField(default="{}")
    run_tags = models.CharField(max_length=255, null=True)
    skip_tags = models.CharField(max_length=255, null=True)
    check_mode = models.BooleanField(default=False)
    status = models.CharField(max_length=20, default="running", choices=STATUS_CHOICES)
    stats = models.TextField(default="{}")
    duration = models.IntegerField(default=0)
    created_at = models.CharField(max_length=20, default=human_datetime)

    def to_view(self):
        tmp = self.to_dict()
        tmp["extra_vars"] = json.loads(self.extra_vars) if self.extra_vars else {}
        tmp["stats"] = json.loads(self.stats) if self.stats else {}
        tmp["host_ids"] = json.loads(self.host_ids) if self.host_ids else []
        return tmp

    class Meta:
        db_table = "playbook_run"
        ordering = ("-id",)


class Role(models.Model, ModelMixin):
    """Ansible Role 定义"""
    name = models.CharField(max_length=100)
    desc = models.CharField(max_length=255, null=True)
    path = models.CharField(max_length=255)
    requirements = models.TextField(null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.CharField(max_length=20, default=human_datetime)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    updated_at = models.CharField(max_length=20, null=True)

    class Meta:
        db_table = "ansible_role"
        ordering = ("-id",)