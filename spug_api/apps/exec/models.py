# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from libs import ModelMixin, human_datetime
from apps.account.models import User
from apps.host.models import Host
import json


class ExecTemplate(models.Model, ModelMixin):
    name = models.CharField(max_length=50, verbose_name="模板名称")
    type = models.CharField(max_length=50, verbose_name="模板类型")
    body = models.TextField(verbose_name="模板内容")
    interpreter = models.CharField(max_length=20, default="sh", verbose_name="解释器")
    host_ids = models.TextField(default="[]", verbose_name="目标主机")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    parameters = models.TextField(default="[]", verbose_name="参数定义")
    playbook_id = models.IntegerField(null=True, verbose_name="Playbook ID")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")
    updated_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="+", null=True, verbose_name="更新人"
    )

    def __repr__(self):
        return "<ExecTemplate %r>" % self.name

    def to_view(self):
        tmp = self.to_dict()
        tmp["host_ids"] = json.loads(self.host_ids)
        tmp["parameters"] = json.loads(self.parameters)
        return tmp

    class Meta:
        db_table = "exec_templates"
        ordering = ("-id",)


class ExecHistory(models.Model, ModelMixin):
    user = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="执行用户")
    template = models.ForeignKey(ExecTemplate, on_delete=models.SET_NULL, null=True, verbose_name="关联模板")
    digest = models.CharField(max_length=32, db_index=True, verbose_name="摘要")
    interpreter = models.CharField(max_length=20, verbose_name="解释器")
    command = models.TextField(verbose_name="执行命令")
    params = models.TextField(default="{}", verbose_name="执行参数")
    host_ids = models.TextField(verbose_name="目标主机")
    updated_at = models.CharField(max_length=20, default=human_datetime, verbose_name="更新时间")

    def to_view(self):
        tmp = self.to_dict()
        tmp["host_ids"] = json.loads(self.host_ids)
        if self.template:
            tmp["template_name"] = self.template.name
            tmp["interpreter"] = self.template.interpreter
            tmp["parameters"] = json.loads(self.template.parameters)
            tmp["command"] = self.template.body
        return tmp

    class Meta:
        db_table = "exec_histories"
        ordering = ("-updated_at",)


class Transfer(models.Model, ModelMixin):
    user = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="执行用户")
    digest = models.CharField(max_length=32, db_index=True, verbose_name="摘要")
    host_id = models.IntegerField(null=True, verbose_name="目标主机ID")
    src_dir = models.CharField(max_length=255, verbose_name="源目录")
    dst_dir = models.CharField(max_length=255, verbose_name="目标目录")
    host_ids = models.TextField(verbose_name="目标主机列表")
    updated_at = models.CharField(max_length=20, default=human_datetime, verbose_name="更新时间")

    def to_view(self):
        tmp = self.to_dict()
        tmp["host_ids"] = json.loads(self.host_ids)
        return tmp

    class Meta:
        db_table = "exec_transfer"
        ordering = ("-id",)



class InspectItem(models.Model, ModelMixin):
    name = models.CharField(max_length=50, verbose_name="巡检项名称")
    category = models.CharField(max_length=50, default="custom", verbose_name="分类")
    interpreter = models.CharField(max_length=20, default="sh", verbose_name="解释器")
    command = models.TextField(verbose_name="执行命令")
    match_type = models.CharField(max_length=20, default="regex_pass", verbose_name="匹配方式")
    pattern = models.TextField(default="", verbose_name="正则表达式")
    threshold_op = models.CharField(max_length=10, default="none", verbose_name="阈值比较符")
    threshold_val = models.FloatField(null=True, verbose_name="阈值")
    expect_status = models.CharField(max_length=20, default="warning", verbose_name="期望状态")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    is_active = models.BooleanField(default=True, verbose_name="启用状态")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", null=True, verbose_name="更新人")

    def __repr__(self):
        return "<InspectItem %r>" % self.name

    class Meta:
        db_table = "exec_inspect_items"
        ordering = ("id",)


class InspectTask(models.Model, ModelMixin):
    name = models.CharField(max_length=50, verbose_name="任务名称")
    item_ids = models.TextField(default="[]", verbose_name="巡检项列表")
    host_ids = models.TextField(default="[]", verbose_name="目标主机")
    notify_grp = models.TextField(default="[]", verbose_name="通知组")
    notify_mode = models.TextField(default="[]", verbose_name="通知方式")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", null=True, verbose_name="更新人")

    def __repr__(self):
        return "<InspectTask %r>" % self.name

    def to_view(self):
        tmp = self.to_dict()
        tmp["item_ids"] = json.loads(self.item_ids)
        tmp["host_ids"] = json.loads(self.host_ids)
        tmp["notify_grp"] = json.loads(self.notify_grp)
        tmp["notify_mode"] = json.loads(self.notify_mode)
        items = InspectItem.objects.filter(id__in=tmp["item_ids"])
        tmp["items"] = [{"id": x.id, "name": x.name, "category": x.category} for x in items]
        latest = InspectResult.objects.filter(task_id=self.id).order_by('-id').first()
        if latest:
            results = InspectResult.objects.filter(task_id=self.id, batch_id=latest.batch_id)
            statuses = list(results.values_list('status', flat=True))
            if any(s in statuses for s in ['running', 'pending']):
                tmp["latest_status"] = 'running'
            elif any(s == 'error' for s in statuses):
                tmp["latest_status"] = 'error'
            elif any(s == 'warning' for s in statuses):
                tmp["latest_status"] = 'warning'
            else:
                tmp["latest_status"] = 'success'
            tmp["latest_run_at"] = latest.run_at
            tmp["latest_batch_id"] = latest.batch_id
        else:
            tmp["latest_status"] = 'pending'
            tmp["latest_run_at"] = None
            tmp["latest_batch_id"] = None
        return tmp

    class Meta:
        db_table = "exec_inspect_tasks"
        ordering = ("-id",)


class InspectResult(models.Model, ModelMixin):
    task_id = models.IntegerField(verbose_name="任务ID")
    batch_id = models.CharField(max_length=36, default="", verbose_name="批次ID")
    host_id = models.IntegerField(verbose_name="主机ID")
    item_id = models.IntegerField(default=0, verbose_name="巡检项ID")
    item_name = models.CharField(max_length=50, default="", verbose_name="巡检项名称")
    status = models.CharField(max_length=20, default="pending", verbose_name="状态")
    output = models.TextField(default="", verbose_name="执行输出")
    matched = models.TextField(default="", verbose_name="匹配内容")
    actual_value = models.FloatField(null=True, verbose_name="实际值")
    exit_code = models.IntegerField(null=True, verbose_name="退出码")
    run_at = models.CharField(max_length=20, default=human_datetime, verbose_name="执行时间")
    duration = models.IntegerField(default=0, verbose_name="耗时(秒)")

    def to_view(self):
        tmp = self.to_dict()
        host = Host.objects.filter(pk=self.host_id).first()
        tmp["host_name"] = host.name if host else str(self.host_id)
        return tmp

    class Meta:
        db_table = "exec_inspect_results"
        ordering = ("-id",)
