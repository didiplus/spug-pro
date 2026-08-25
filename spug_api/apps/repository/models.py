# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from django.conf import settings
from libs.mixins import ModelMixin
from apps.app.models import App, Environment, Deploy
from apps.account.models import User
from datetime import datetime
import json
import os


class Repository(models.Model, ModelMixin):
    STATUS = (
        ('0', '未开始'),
        ('1', '构建中'),
        ('2', '失败'),
        ('5', '成功'),
    )
    app = models.ForeignKey(App, on_delete=models.PROTECT, verbose_name="应用")
    env = models.ForeignKey(Environment, on_delete=models.PROTECT, verbose_name="环境")
    deploy = models.ForeignKey(Deploy, on_delete=models.PROTECT, verbose_name="发布配置")
    version = models.CharField(max_length=100, verbose_name="版本号")
    spug_version = models.CharField(max_length=50, verbose_name="Spug版本")
    remarks = models.CharField(max_length=255, null=True, verbose_name="备注")
    extra = models.TextField(verbose_name="扩展信息")
    status = models.CharField(max_length=2, choices=STATUS, default='0', verbose_name="构建状态")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, verbose_name="创建人")

    @staticmethod
    def make_spug_version(deploy_id):
        return f'{deploy_id}_{datetime.now().strftime("%Y%m%d%H%M%S")}'

    def to_view(self):
        tmp = self.to_dict()
        tmp['extra'] = json.loads(self.extra)
        tmp['status_alias'] = self.get_status_display()
        if hasattr(self, 'app_name'):
            tmp['app_name'] = self.app_name
        if hasattr(self, 'env_name'):
            tmp['env_name'] = self.env_name
        if hasattr(self, 'created_by_user'):
            tmp['created_by_user'] = self.created_by_user
        return tmp

    def delete(self, using=None, keep_parents=False):
        super().delete(using, keep_parents)
        try:
            build_file = f'{self.spug_version}.tar.gz'
            os.remove(os.path.join(settings.BUILD_DIR, build_file))
        except FileNotFoundError:
            pass

    class Meta:
        db_table = 'repositories'
        ordering = ('-id',)
