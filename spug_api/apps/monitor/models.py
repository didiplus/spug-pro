# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from libs import ModelMixin, human_datetime
from apps.account.models import User
import json


class Detection(models.Model, ModelMixin):
    TYPES = (
        ("1", "站点检测"),
        ("2", "端口检测"),
        ("3", "进程检测"),
        ("4", "自定义脚本"),
        ("5", "Ping检测"),
        ("6", "HTTP高级检测"),
        ("7", "数据库检测"),
        ("8", "日志关键词检测"),
        ("9", "Prometheus指标"),
        ("10", "Playbook检测"),
    )
    STATUS = (
        (0, "正常"),
        (1, "异常"),
    )
    name = models.CharField(max_length=50, verbose_name="检测名称")
    type = models.CharField(max_length=2, choices=TYPES, verbose_name="检测类型")
    group = models.CharField(max_length=255, null=True, verbose_name="分组")
    targets = models.TextField(verbose_name="检测目标")
    extra = models.TextField(null=True, verbose_name="扩展信息")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    is_active = models.BooleanField(default=True, verbose_name="启用状态")
    rate = models.IntegerField(default=5, verbose_name="检测频率(秒)")
    threshold = models.IntegerField(default=3, verbose_name="连续阈值")
    quiet = models.IntegerField(default=24 * 60, verbose_name="静默时长(分钟)")
    fault_times = models.SmallIntegerField(default=0, verbose_name="故障次数")
    notify_mode = models.CharField(max_length=255, verbose_name="通知方式")
    notify_grp = models.CharField(max_length=255, verbose_name="通知组")
    alarm_policy = models.ForeignKey(
        'alarm.AlarmPolicy', on_delete=models.SET_NULL, null=True, blank=True, related_name='+', verbose_name="告警策略"
    )
    latest_run_time = models.CharField(max_length=20, null=True, verbose_name="最近检测时间")

    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")
    updated_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="+", null=True, verbose_name="更新人"
    )

    def to_view(self):
        tmp = self.to_dict()
        tmp["type_alias"] = self.get_type_display()
        tmp["notify_mode"] = json.loads(self.notify_mode)
        tmp["notify_grp"] = json.loads(self.notify_grp)
        tmp["targets"] = json.loads(self.targets)
        tmp["alarm_policy"] = self.alarm_policy_id
        return tmp

    def __repr__(self):
        return "<Detection %r>" % self.name

    class Meta:
        db_table = "detections"
        ordering = ("-id",)


class Dashboard(models.Model, ModelMixin):
    name = models.CharField(max_length=100, verbose_name="大盘名称")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    refresh = models.IntegerField(default=30, verbose_name="刷新间隔(秒)")
    datasource_url = models.CharField(max_length=255, verbose_name="数据源地址")
    is_active = models.BooleanField(default=True, verbose_name="启用状态")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")

    def to_view(self):
        tmp = self.to_dict()
        tmp["panels"] = [p.to_view() for p in self.panels.all().order_by("sort_order")]
        return tmp

    class Meta:
        db_table = "monitor_dashboard"
        ordering = ("-id",)


class DashboardPanel(models.Model, ModelMixin):
    PANEL_TYPES = (
        ("timeseries", "时间序列"),
        ("stat", "单值统计"),
        ("gauge", "仪表盘"),
        ("table", "表格"),
        ("bar", "柱状图"),
    )
    dashboard = models.ForeignKey(Dashboard, on_delete=models.CASCADE, related_name="panels", verbose_name="所属大盘")
    title = models.CharField(max_length=100, verbose_name="面板标题")
    panel_type = models.CharField(max_length=20, choices=PANEL_TYPES, default="timeseries", verbose_name="面板类型")
    query = models.TextField(verbose_name="查询表达式")
    unit = models.CharField(max_length=20, null=True, verbose_name="单位")
    sort_order = models.IntegerField(default=0, verbose_name="排序")
    col_span = models.IntegerField(default=12, verbose_name="列宽(1-24)")
    height = models.IntegerField(default=300, verbose_name="高度")
    config = models.TextField(default="{}", verbose_name="面板配置")

    def to_view(self):
        tmp = self.to_dict(excludes=("dashboard",))
        tmp["config"] = json.loads(self.config) if self.config else {}
        return tmp

    class Meta:
        db_table = "monitor_dashboard_panel"
        ordering = ("sort_order",)
