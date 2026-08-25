# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from django.conf import settings
from libs import ModelMixin, human_datetime
from apps.account.models import User
from apps.app.models import Deploy
from apps.repository.models import Repository
import json
import os


class DeployRequest(models.Model, ModelMixin):
    STATUS = (
        ("-3", "发布异常"),
        ("-1", "已驳回"),
        ("0", "待审核"),
        ("1", "待发布"),
        ("2", "发布中"),
        ("3", "发布成功"),
    )
    TYPES = (
        ("1", "正常发布"),
        ("2", "回滚"),
        ("3", "自动发布"),
    )
    deploy = models.ForeignKey(Deploy, on_delete=models.CASCADE, verbose_name="发布配置")
    repository = models.ForeignKey(Repository, null=True, on_delete=models.SET_NULL, verbose_name="代码仓库")
    name = models.CharField(max_length=100, verbose_name="发布标题")
    type = models.CharField(max_length=2, choices=TYPES, default="1", verbose_name="发布类型")
    extra = models.TextField(verbose_name="扩展信息")
    host_ids = models.TextField(verbose_name="目标主机")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    status = models.CharField(max_length=2, choices=STATUS, verbose_name="状态")
    reason = models.CharField(max_length=255, null=True, verbose_name="驳回原因")
    version = models.CharField(max_length=100, null=True, verbose_name="版本号")
    spug_version = models.CharField(max_length=50, null=True, verbose_name="Spug版本")
    plan = models.DateTimeField(null=True, verbose_name="计划发布时间")
    fail_host_ids = models.TextField(default="[]", verbose_name="失败主机")

    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    approve_at = models.CharField(max_length=20, null=True, verbose_name="审核时间")
    approve_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="+", null=True, verbose_name="审核人"
    )
    do_at = models.CharField(max_length=20, null=True, verbose_name="发布时间")
    do_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="+", null=True, verbose_name="发布人"
    )

    @property
    def is_quick_deploy(self):
        if self.type in ("1", "3") and self.deploy.extend == "1" and self.extra:
            extra = json.loads(self.extra)
            return extra[0] in ("branch", "tag")
        return False

    def delete(self, using=None, keep_parents=False):
        super().delete(using, keep_parents)
        if self.repository_id:
            if not DeployRequest.objects.filter(repository=self.repository).exists():
                self.repository.delete()
        if self.deploy.extend == "2":
            try:
                os.remove(
                    os.path.join(
                        settings.REPOS_DIR, str(self.deploy_id), self.spug_version
                    )
                )
            except FileNotFoundError:
                pass

    def __repr__(self):
        return f"<DeployRequest name={self.name}>"

    class Meta:
        db_table = "deploy_requests"
        ordering = ("-id",)
