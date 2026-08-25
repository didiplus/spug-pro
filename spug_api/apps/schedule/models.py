# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from libs import ModelMixin, human_datetime
from apps.account.models import User
import json


class History(models.Model, ModelMixin):
    STATUS = (
        (0, "执行中"),
        (1, "成功"),
        (2, "失败"),
    )
    task_id = models.IntegerField(verbose_name="任务ID")
    status = models.SmallIntegerField(choices=STATUS, verbose_name="状态")
    run_time = models.CharField(max_length=20, verbose_name="执行时间")
    output = models.TextField(verbose_name="执行输出")

    def to_list(self):
        tmp = super().to_dict(selects=("id", "status", "run_time"))
        tmp["status_alias"] = self.get_status_display()
        return tmp

    class Meta:
        db_table = "task_histories"
        ordering = ("-id",)


class Task(models.Model, ModelMixin):
    TRIGGERS = (
        ("date", "一次性"),
        ("calendarinterval", "日历间隔"),
        ("cron", "UNIX cron"),
        ("interval", "普通间隔"),
    )
    name = models.CharField(max_length=50, verbose_name="任务名称")
    type = models.CharField(max_length=50, verbose_name="任务类型")
    interpreter = models.CharField(max_length=20, default="sh", verbose_name="解释器")
    command = models.TextField(verbose_name="执行命令")
    targets = models.TextField(verbose_name="目标主机")
    trigger = models.CharField(max_length=20, choices=TRIGGERS, verbose_name="触发器类型")
    trigger_args = models.CharField(max_length=255, verbose_name="触发器参数")
    is_active = models.BooleanField(default=False, verbose_name="启用状态")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    latest = models.ForeignKey(History, on_delete=models.PROTECT, null=True, verbose_name="最近执行记录")
    rst_notify = models.CharField(max_length=255, null=True, verbose_name="结果通知")


    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")
    updated_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="+", null=True, verbose_name="更新人"
    )

    def to_dict(self, *args, **kwargs):
        tmp = super().to_dict(*args, **kwargs)
        tmp["targets"] = json.loads(self.targets)
        tmp["latest_status"] = self.latest.status if self.latest else None
        tmp["latest_run_time"] = self.latest.run_time if self.latest else None
        tmp["latest_status_alias"] = (
            self.latest.get_status_display() if self.latest else None
        )
        tmp["rst_notify"] = (
            json.loads(self.rst_notify) if self.rst_notify else {"mode": "0"}
        )
        if self.trigger == "cron":
            tmp["trigger_args"] = json.loads(self.trigger_args)
        return tmp

    def __repr__(self):
        return "<Task %r>" % self.name

    class Meta:
        db_table = "tasks"
        ordering = ("-id",)
