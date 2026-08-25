# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from libs import ModelMixin, human_datetime
from apps.account.models import User


class Environment(models.Model, ModelMixin):
    name = models.CharField(max_length=50, verbose_name="环境名称")
    key = models.CharField(max_length=50, verbose_name="环境标识")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    sort_id = models.IntegerField(default=0, db_index=True, verbose_name="排序ID")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, verbose_name="创建人")

    def __repr__(self):
        return f'<Environment {self.name!r}>'

    class Meta:
        db_table = 'environments'
        ordering = ('-sort_id',)


class Service(models.Model, ModelMixin):
    name = models.CharField(max_length=50, verbose_name="服务名称")
    key = models.CharField(max_length=50, unique=True, verbose_name="服务标识")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, verbose_name="创建人")

    def __repr__(self):
        return f'<Service {self.name!r}>'

    class Meta:
        db_table = 'services'
        ordering = ('-id',)


class Config(models.Model, ModelMixin):
    TYPES = (
        ('app', 'App'),
        ('src', 'Service')
    )
    type = models.CharField(max_length=5, choices=TYPES, verbose_name="配置类型")
    o_id = models.IntegerField(verbose_name="对象ID")
    key = models.CharField(max_length=50, verbose_name="配置键")
    env = models.ForeignKey(Environment, on_delete=models.PROTECT, verbose_name="环境")
    value = models.TextField(null=True, verbose_name="配置值")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    is_public = models.BooleanField(default=False, verbose_name="是否公开")
    updated_at = models.CharField(max_length=20, verbose_name="更新时间")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, verbose_name="更新人")

    def __repr__(self):
        return f'<Config {self.key!r}>'

    class Meta:
        db_table = 'configs'
        ordering = ('-key',)


class ConfigHistory(models.Model, ModelMixin):
    ACTIONS = (
        ('1', '新增'),
        ('2', '更新'),
        ('3', '删除')
    )
    type = models.CharField(max_length=5, verbose_name="配置类型")
    o_id = models.IntegerField(verbose_name="对象ID")
    key = models.CharField(max_length=50, verbose_name="配置键")
    env_id = models.IntegerField(verbose_name="环境ID")
    value = models.TextField(null=True, verbose_name="配置值")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    is_public = models.BooleanField(verbose_name="是否公开")
    old_value = models.TextField(null=True, verbose_name="旧配置值")
    action = models.CharField(max_length=2, choices=ACTIONS, verbose_name="操作类型")
    updated_at = models.CharField(max_length=20, verbose_name="更新时间")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, verbose_name="更新人")

    def __repr__(self):
        return f'<ConfigHistory {self.key!r}>'

    class Meta:
        db_table = 'config_histories'
        ordering = ('key',)
