from django.db import models
from libs import ModelMixin, human_datetime
from apps.account.models import User
import json

RUN_STATUS = (
    ('0', '待执行'),
    ('1', '执行中'),
    ('2', '成功'),
    ('3', '失败'),
    ('4', '已中断'),
)

TRIGGER_TYPES = (
    ('manual', '手动触发'),
    ('api', 'API触发'),
)


def _safe_json(value, default):
    try:
        return json.loads(value) if value else default
    except (json.JSONDecodeError, TypeError):
        return default


class Pipeline(models.Model, ModelMixin):
    name = models.CharField(max_length=100, verbose_name="流水线名称")
    desc = models.CharField(max_length=500, null=True, verbose_name="描述")
    group_id = models.IntegerField(default=1, verbose_name="分组ID")
    nodes = models.TextField(default="[]", verbose_name="节点定义")
    is_active = models.BooleanField(default=True, verbose_name="启用状态")
    latest_at = models.CharField(max_length=20, null=True, verbose_name="最近执行时间")
    latest_status = models.IntegerField(default=None, null=True, verbose_name="最近执行状态")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", null=True, verbose_name="更新人")

    def __repr__(self):
        return "<Pipeline %r>" % self.name

    def to_view(self):
        tmp = self.to_dict()
        tmp["nodes"] = _safe_json(self.nodes, [])
        tmp["created_by_user"] = self.created_by.nickname if self.created_by else None
        return tmp

    class Meta:
        db_table = "pipelines"
        ordering = ("-id",)


class PipelineHistory(models.Model, ModelMixin):
    pipeline = models.ForeignKey(Pipeline, on_delete=models.CASCADE, verbose_name="关联流水线")
    token = models.CharField(max_length=32, db_index=True, verbose_name="执行标识")
    status = models.IntegerField(default=0, verbose_name="执行状态")
    nodes = models.TextField(default="[]", verbose_name="节点快照")
    deploy_status = models.TextField(default="{}", verbose_name="节点执行状态")
    error_message = models.TextField(null=True, verbose_name="错误信息")
    started_at = models.CharField(max_length=20, null=True, verbose_name="开始时间")
    finished_at = models.CharField(max_length=20, null=True, verbose_name="完成时间")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="+", verbose_name="触发用户")

    def __repr__(self):
        return "<PipelineHistory %r>" % self.token

    @property
    def deploy_key(self):
        return f"spug:pipeline:{self.token}"

    @property
    def pub_channel(self):
        return f"spug:pipeline:log:{self.token}"

    @property
    def status_alias(self):
        return dict(RUN_STATUS).get(str(self.status), str(self.status))

    def to_view(self):
        tmp = self.to_dict()
        tmp["nodes"] = _safe_json(self.nodes, [])
        tmp["deploy_status"] = _safe_json(self.deploy_status, {})
        tmp["status_alias"] = self.status_alias
        tmp["pipeline_name"] = self.pipeline.name if self.pipeline else None
        tmp["created_by_name"] = self.created_by.nickname if self.created_by else None
        return tmp

    class Meta:
        db_table = "pipeline_histories"
        ordering = ("-id",)
