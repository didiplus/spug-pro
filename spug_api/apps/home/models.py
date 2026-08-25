# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from libs.mixins import ModelMixin
import json


class Notice(models.Model, ModelMixin):
    title = models.CharField(max_length=100, verbose_name="标题")
    content = models.TextField(verbose_name="内容")
    is_stress = models.BooleanField(default=False, verbose_name="是否强调")
    read_ids = models.TextField(default='[]', verbose_name="已读用户ID")
    sort_id = models.IntegerField(default=0, db_index=True, verbose_name="排序ID")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")

    def to_view(self):
        tmp = self.to_dict()
        tmp['read_ids'] = json.loads(self.read_ids)
        return tmp

    class Meta:
        db_table = 'notices'
        ordering = ('-sort_id',)


class Navigation(models.Model, ModelMixin):
    title = models.CharField(max_length=64, verbose_name="标题")
    desc = models.CharField(max_length=128, verbose_name="描述")
    logo = models.TextField(verbose_name="Logo")
    links = models.TextField(verbose_name="链接列表")
    sort_id = models.IntegerField(default=0, db_index=True, verbose_name="排序ID")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")

    def to_view(self):
        tmp = self.to_dict()
        tmp['links'] = json.loads(self.links)
        return tmp

    class Meta:
        db_table = 'navigations'
        ordering = ('-sort_id',)
