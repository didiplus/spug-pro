# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from django.conf import settings
from libs import ModelMixin, human_datetime
from apps.account.models import User
from apps.config.models import Environment
import subprocess
import json
import os


class App(models.Model, ModelMixin):
    name = models.CharField(max_length=50, verbose_name="应用名称")
    key = models.CharField(max_length=50, unique=True, verbose_name="应用标识")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    rel_apps = models.TextField(null=True, verbose_name="关联应用")
    rel_services = models.TextField(null=True, verbose_name="关联服务")
    sort_id = models.IntegerField(default=0, db_index=True, verbose_name="排序ID")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, verbose_name="创建人")

    def to_dict(self, *args, **kwargs):
        tmp = super().to_dict(*args, **kwargs)
        tmp["rel_apps"] = json.loads(self.rel_apps) if self.rel_apps else []
        tmp["rel_services"] = json.loads(self.rel_services) if self.rel_services else []
        return tmp

    def __repr__(self):
        return f"<App {self.name!r}>"

    class Meta:
        db_table = "apps"
        ordering = ("-sort_id",)


class Deploy(models.Model, ModelMixin):
    EXTENDS = (
        ("1", "常规发布"),
        ("2", "自定义发布"),
    )
    app = models.ForeignKey(App, on_delete=models.PROTECT, verbose_name="应用")
    env = models.ForeignKey(Environment, on_delete=models.PROTECT, verbose_name="环境")
    host_ids = models.TextField(verbose_name="目标主机")
    extend = models.CharField(max_length=2, choices=EXTENDS, verbose_name="发布模式")
    is_audit = models.BooleanField(verbose_name="需要审核")
    is_parallel = models.BooleanField(default=True, verbose_name="并行发布")
    rst_notify = models.CharField(max_length=255, null=True, verbose_name="结果通知")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")
    updated_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="+", null=True, verbose_name="更新人"
    )

    @property
    def extend_obj(self):
        cls = DeployExtend1 if self.extend == "1" else DeployExtend2
        return cls.objects.filter(deploy=self).first()

    def to_dict(self, *args, **kwargs):
        deploy = super().to_dict(*args, **kwargs)
        deploy["app_key"] = self.app_key if hasattr(self, "app_key") else None
        deploy["app_name"] = self.app_name if hasattr(self, "app_name") else None
        deploy["host_ids"] = json.loads(self.host_ids)
        deploy["rst_notify"] = json.loads(self.rst_notify)
        deploy.update(self.extend_obj.to_dict())
        return deploy

    def delete(self, using=None, keep_parents=False):
        deploy_id = self.id
        super().delete(using, keep_parents)
        repo_dir = os.path.join(settings.REPOS_DIR, str(deploy_id))
        build_pattern = os.path.join(settings.BUILD_DIR, f"{deploy_id}_*")
        try:
            # 使用 glob 查找匹配的文件并安全删除，避免命令注入
            import glob
            if os.path.exists(repo_dir):
                subprocess.run(['rm', '-rf', repo_dir], check=False)
            for path in glob.glob(build_pattern):
                subprocess.run(['rm', '-rf', path], check=False)
        except Exception:
            pass  # 静默失败，避免影响主流程

    def __repr__(self):
        return "<Deploy app_id=%r env_id=%r>" % (self.app_id, self.env_id)

    class Meta:
        db_table = "deploys"
        ordering = ("-id",)


class DeployExtend1(models.Model, ModelMixin):
    deploy = models.OneToOneField(Deploy, primary_key=True, on_delete=models.CASCADE, verbose_name="发布配置")
    git_repo = models.CharField(max_length=255, verbose_name="Git仓库地址")
    dst_dir = models.CharField(max_length=255, verbose_name="目标目录")
    dst_repo = models.CharField(max_length=255, verbose_name="目标仓库目录")
    versions = models.IntegerField(verbose_name="保留版本数")
    filter_rule = models.TextField(verbose_name="过滤规则")
    hook_pre_server = models.TextField(null=True, verbose_name="服务器前置钩子")
    hook_post_server = models.TextField(null=True, verbose_name="服务器后置钩子")
    hook_pre_host = models.TextField(null=True, verbose_name="主机前置钩子")
    hook_post_host = models.TextField(null=True, verbose_name="主机后置钩子")
    hook_pre_playbook = models.IntegerField(null=True, verbose_name="前置Playbook ID")
    hook_post_playbook = models.IntegerField(null=True, verbose_name="后置Playbook ID")

    def to_dict(self, *args, **kwargs):
        tmp = super().to_dict(*args, **kwargs)
        tmp["filter_rule"] = json.loads(self.filter_rule)
        return tmp

    def __repr__(self):
        return "<DeployExtend1 deploy_id=%r>" % self.deploy_id

    class Meta:
        db_table = "deploy_extend1"


class DeployExtend2(models.Model, ModelMixin):
    deploy = models.OneToOneField(Deploy, primary_key=True, on_delete=models.CASCADE, verbose_name="发布配置")
    server_actions = models.TextField(verbose_name="服务器动作")
    host_actions = models.TextField(verbose_name="主机动作")
    require_upload = models.BooleanField(default=False, verbose_name="需要上传文件")

    def to_dict(self, *args, **kwargs):
        tmp = super().to_dict(*args, **kwargs)
        tmp["server_actions"] = json.loads(self.server_actions)
        tmp["host_actions"] = json.loads(self.host_actions)
        return tmp

    def __repr__(self):
        return "<DeployExtend2 deploy_id=%r>" % self.deploy_id

    class Meta:
        db_table = "deploy_extend2"
