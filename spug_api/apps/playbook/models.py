# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from libs import ModelMixin, human_datetime
from apps.account.models import User
import json
import logging

logger = logging.getLogger(__name__)


def _safe_json_loads(value, default):
    try:
        return json.loads(value) if value else default
    except (json.JSONDecodeError, TypeError) as e:
        logger.warning(f'JSON 解析失败: {e}, value={value!r:.100}')
        return default


class Playbook(models.Model, ModelMixin):
    """Ansible Playbook 定义"""
    name = models.CharField(max_length=100, verbose_name="名称")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    content = models.TextField(verbose_name="Playbook内容")
    extra_vars = models.TextField(default="{}", verbose_name="额外变量")

    group_id = models.IntegerField(null=True, verbose_name="分组ID")
    tags = models.CharField(max_length=255, null=True, verbose_name="标签")
    forks = models.IntegerField(default=0, verbose_name="并发数")
    timeout = models.IntegerField(default=0, verbose_name="超时(秒)")
    is_active = models.BooleanField(default=True, verbose_name="启用状态")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", null=True, verbose_name="更新人")

    def to_view(self):
        tmp = self.to_dict()
        tmp["extra_vars"] = _safe_json_loads(self.extra_vars, {})
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
    playbook = models.ForeignKey(Playbook, on_delete=models.CASCADE, related_name="runs", verbose_name="Playbook")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+", verbose_name="执行用户")
    token = models.CharField(max_length=32, db_index=True, verbose_name="执行令牌")
    host_ids = models.TextField(verbose_name="目标主机")
    extra_vars = models.TextField(default="{}", verbose_name="额外变量")
    run_tags = models.CharField(max_length=255, null=True, verbose_name="运行标签")
    skip_tags = models.CharField(max_length=255, null=True, verbose_name="跳过标签")
    check_mode = models.BooleanField(default=False, verbose_name="检查模式")
    status = models.CharField(max_length=20, default="running", choices=STATUS_CHOICES, verbose_name="状态")
    stats = models.TextField(default="{}", verbose_name="执行统计")
    duration = models.IntegerField(default=0, verbose_name="耗时(秒)")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")

    def to_view(self):
        tmp = self.to_dict()
        tmp["extra_vars"] = _safe_json_loads(self.extra_vars, {})
        tmp["stats"] = _safe_json_loads(self.stats, {})
        tmp["host_ids"] = _safe_json_loads(self.host_ids, [])
        return tmp

    class Meta:
        db_table = "playbook_run"
        ordering = ("-id",)


class Role(models.Model, ModelMixin):
    """Ansible Role 定义"""
    name = models.CharField(max_length=100, verbose_name="名称")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    path = models.CharField(max_length=255, verbose_name="路径")
    requirements = models.TextField(null=True, verbose_name="依赖要求")
    is_active = models.BooleanField(default=True, verbose_name="启用状态")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")

    class Meta:
        db_table = "ansible_role"
        ordering = ("-id",)