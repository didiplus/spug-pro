# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from libs import ModelMixin, human_datetime
from libs.fields import EncryptedTextField
from apps.account.models import User
from apps.setting.utils import AppSetting
from libs.ssh import SSH
import json


class Host(models.Model, ModelMixin):
    name = models.CharField(max_length=100, verbose_name="主机名称")
    hostname = models.CharField(max_length=50, verbose_name="主机地址")
    port = models.IntegerField(null=True, verbose_name="SSH端口")
    username = models.CharField(max_length=50, verbose_name="用户名")
    pkey = EncryptedTextField(null=True, verbose_name="密钥")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    is_verified = models.BooleanField(default=False, verbose_name="已验证")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")

    @property
    def private_key(self):
        return self.pkey or AppSetting.get("private_key")

    def get_ssh(self, pkey=None, default_env=None):
        pkey = pkey or self.private_key
        return SSH(
            self.hostname, self.port, self.username, pkey, default_env=default_env
        )

    def to_view(self):
        tmp = self.to_dict()
        if hasattr(self, "hostextend"):
            tmp.update(self.hostextend.to_view())
        tmp["group_ids"] = []
        return tmp

    def __repr__(self):
        return "<Host %r>" % self.name

    class Meta:
        db_table = "hosts"
        ordering = ("-id",)


class HostExtend(models.Model, ModelMixin):
    INSTANCE_CHARGE_TYPES = (
        ("PrePaid", "包年包月"),
        ("PostPaid", "按量计费"),
        ("Other", "其他"),
    )
    INTERNET_CHARGE_TYPES = (
        ("PayByTraffic", "按流量计费"),
        ("PayByBandwidth", "按带宽计费"),
        ("Other", "其他"),
    )
    host = models.OneToOneField(Host, on_delete=models.CASCADE, verbose_name="关联主机")
    instance_id = models.CharField(max_length=64, null=True, verbose_name="实例ID")
    zone_id = models.CharField(max_length=30, null=True, verbose_name="可用区ID")
    cpu = models.IntegerField(verbose_name="CPU核心数")
    memory = models.FloatField(verbose_name="内存(GB)")
    disk = models.CharField(max_length=255, default="[]", verbose_name="磁盘信息")
    os_name = models.CharField(max_length=50, verbose_name="操作系统名称")
    os_type = models.CharField(max_length=20, verbose_name="操作系统类型")
    private_ip_address = models.CharField(max_length=255, verbose_name="内网IP")
    public_ip_address = models.CharField(max_length=255, verbose_name="公网IP")
    instance_charge_type = models.CharField(
        max_length=20, choices=INSTANCE_CHARGE_TYPES, verbose_name="实例计费类型"
    )
    internet_charge_type = models.CharField(
        max_length=20, choices=INTERNET_CHARGE_TYPES, verbose_name="网络计费类型"
    )
    created_time = models.CharField(max_length=20, null=True, verbose_name="创建时间")
    expired_time = models.CharField(max_length=20, null=True, verbose_name="过期时间")
    updated_at = models.CharField(max_length=20, default=human_datetime, verbose_name="更新时间")

    def to_view(self):
        tmp = self.to_dict(excludes=("id",))
        tmp["disk"] = json.loads(self.disk)
        tmp["private_ip_address"] = json.loads(self.private_ip_address)
        tmp["public_ip_address"] = json.loads(self.public_ip_address)
        tmp["instance_charge_type_alias"] = self.get_instance_charge_type_display()
        tmp["internet_charge_type_alisa"] = self.get_internet_charge_type_display()
        return tmp

    class Meta:
        db_table = "host_extend"


class Group(models.Model, ModelMixin):
    name = models.CharField(max_length=50, verbose_name="分组名称")
    parent_id = models.IntegerField(default=0, verbose_name="父分组ID")
    sort_id = models.IntegerField(default=0, verbose_name="排序ID")
    hosts = models.ManyToManyField(Host, related_name="groups", verbose_name="关联主机")

    def to_view(self, with_hosts=False):
        response = dict(key=self.id, value=self.id, title=self.name, children=[])
        if with_hosts:

            def make_item(x):
                return dict(
                    title=x.name,
                    hostname=x.hostname,
                    key=f"{self.id}_{x.id}",
                    id=x.id,
                    isLeaf=True,
                )

            response["children"] = [make_item(x) for x in self.hosts.all()]
        return response

    class Meta:
        db_table = "host_groups"
        ordering = ("-sort_id",)
