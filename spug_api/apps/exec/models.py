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



class InspectTask(models.Model, ModelMixin):
    name = models.CharField(max_length=50)
    template_id = models.IntegerField()
    interpreter = models.CharField(max_length=20, default="sh")
    command = models.TextField()
    rule = models.TextField(default='{"type":"exit_code","exit_codes":[0]}')
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
        tmp["host_ids"] = json.loads(self.host_ids)
        tmp["rule"] = json.loads(self.rule)
        tmp["notify_grp"] = json.loads(self.notify_grp)
        tmp["notify_mode"] = json.loads(self.notify_mode)
        tpl = ExecTemplate.objects.filter(pk=self.template_id).first()
        tmp["template_name"] = tpl.name if tpl else ''
        latest = InspectResult.objects.filter(task_id=self.id).order_by('-id').first()
        if latest:
            results = InspectResult.objects.filter(task_id=self.id, run_at=latest.run_at)
            statuses = list(results.values_list('status', flat=True))
            if any(s in statuses for s in ['running', 'pending']):
                tmp["latest_status"] = 'running'
            elif any(s == 'error' for s in statuses):
                tmp["latest_status"] = 'error'
            elif any(s == 'warning' for s in statuses):
                tmp["latest_status"] = 'warning'
            else:
                tmp["latest_status"] = 'success'
        else:
            tmp["latest_status"] = 'pending'
        return tmp

    class Meta:
        db_table = "exec_inspect_tasks"
        ordering = ("-id",)


class InspectResult(models.Model, ModelMixin):
    task_id = models.IntegerField()
    host_id = models.IntegerField()
    status = models.CharField(max_length=20, default="pending")
    output = models.TextField(default="")
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
