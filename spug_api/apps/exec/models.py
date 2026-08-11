# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from libs import ModelMixin, human_datetime
from apps.account.models import User
from apps.host.models import Host
import json


class ExecTemplate(models.Model, ModelMixin):
    name = models.CharField(max_length=50)
    type = models.CharField(max_length=50)
    body = models.TextField()
    interpreter = models.CharField(max_length=20, default="sh")
    host_ids = models.TextField(default="[]")
    desc = models.CharField(max_length=255, null=True)
    parameters = models.TextField(default="[]")
    playbook_id = models.IntegerField(null=True)
    created_at = models.CharField(max_length=20, default=human_datetime)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    updated_at = models.CharField(max_length=20, null=True)
    updated_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="+", null=True
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
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    template = models.ForeignKey(ExecTemplate, on_delete=models.SET_NULL, null=True)
    digest = models.CharField(max_length=32, db_index=True)
    interpreter = models.CharField(max_length=20)
    command = models.TextField()
    params = models.TextField(default="{}")
    host_ids = models.TextField()
    updated_at = models.CharField(max_length=20, default=human_datetime)

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
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    digest = models.CharField(max_length=32, db_index=True)
    host_id = models.IntegerField(null=True)
    src_dir = models.CharField(max_length=255)
    dst_dir = models.CharField(max_length=255)
    host_ids = models.TextField()
    updated_at = models.CharField(max_length=20, default=human_datetime)

    def to_view(self):
        tmp = self.to_dict()
        tmp["host_ids"] = json.loads(self.host_ids)
        return tmp

    class Meta:
        db_table = "exec_transfer"
        ordering = ("-id",)



class InspectItem(models.Model, ModelMixin):
    name = models.CharField(max_length=50)
    category = models.CharField(max_length=50, default="custom")
    interpreter = models.CharField(max_length=20, default="sh")
    command = models.TextField()
    match_type = models.CharField(max_length=20, default="regex_pass")
    pattern = models.TextField(default="")
    threshold_op = models.CharField(max_length=10, default="none")
    threshold_val = models.FloatField(null=True)
    expect_status = models.CharField(max_length=20, default="warning")
    desc = models.CharField(max_length=255, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.CharField(max_length=20, default=human_datetime)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    updated_at = models.CharField(max_length=20, null=True)
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", null=True)

    def __repr__(self):
        return "<InspectItem %r>" % self.name

    class Meta:
        db_table = "exec_inspect_items"
        ordering = ("id",)


class InspectTask(models.Model, ModelMixin):
    name = models.CharField(max_length=50)
    item_ids = models.TextField(default="[]")
    host_ids = models.TextField(default="[]")
    notify_grp = models.TextField(default="[]")
    notify_mode = models.TextField(default="[]")
    desc = models.CharField(max_length=255, null=True)
    created_at = models.CharField(max_length=20, default=human_datetime)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    updated_at = models.CharField(max_length=20, null=True)
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", null=True)

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
    task_id = models.IntegerField()
    batch_id = models.CharField(max_length=36, default="")
    host_id = models.IntegerField()
    item_id = models.IntegerField(default=0)
    item_name = models.CharField(max_length=50, default="")
    status = models.CharField(max_length=20, default="pending")
    output = models.TextField(default="")
    matched = models.TextField(default="")
    actual_value = models.FloatField(null=True)
    exit_code = models.IntegerField(null=True)
    run_at = models.CharField(max_length=20, default=human_datetime)
    duration = models.IntegerField(default=0)

    def to_view(self):
        tmp = self.to_dict()
        host = Host.objects.filter(pk=self.host_id).first()
        tmp["host_name"] = host.name if host else str(self.host_id)
        return tmp

    class Meta:
        db_table = "exec_inspect_results"
        ordering = ("-id",)
