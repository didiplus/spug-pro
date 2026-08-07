# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from libs import ModelMixin, human_datetime
from libs.fields import EncryptedTextField
from apps.account.models import User
from apps.host.models import Host
import json


class InventoryGroup(models.Model, ModelMixin):
    """Ansible Inventory 分组，支持嵌套子组和组变量"""
    name = models.CharField(max_length=100)
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, related_name="children")
    hosts = models.ManyToManyField(Host, related_name="inventory_groups")
    variables = models.TextField(default="{}")
    children_pattern = models.CharField(max_length=255, null=True)
    sort_id = models.IntegerField(default=0)

    def to_view(self, with_hosts=False):
        tmp = self.to_dict(excludes=("variables",))
        try:
            tmp["variables"] = json.loads(self.variables) if self.variables else {}
        except (json.JSONDecodeError, TypeError):
            tmp["variables"] = {}
        if with_hosts:
            tmp["hosts"] = [h.id for h in self.hosts.all()]
        return tmp

    class Meta:
        db_table = "ansible_inventory_group"
        ordering = ("-sort_id",)


class HostVariable(models.Model, ModelMixin):
    """主机变量 (host_vars)"""
    VALUE_TYPES = (
        ("string", "字符串"),
        ("int", "整数"),
        ("bool", "布尔"),
        ("json", "JSON"),
    )
    host = models.ForeignKey(Host, on_delete=models.CASCADE, related_name="variables")
    key = models.CharField(max_length=100)
    value = EncryptedTextField()
    value_type = models.CharField(max_length=20, default="string", choices=VALUE_TYPES)
    is_vault = models.BooleanField(default=False)
    updated_at = models.CharField(max_length=20, default=human_datetime)

    def to_view(self):
        tmp = self.to_dict()
        if self.is_vault:
            tmp["value"] = "******"
            return tmp
        if self.value_type == "json":
            try:
                tmp["value"] = json.loads(self.value)
            except (json.JSONDecodeError, TypeError):
                pass
        elif self.value_type == "bool":
            tmp["value"] = self.value == "true"
        elif self.value_type == "int":
            try:
                tmp["value"] = int(self.value)
            except (ValueError, TypeError):
                pass
        return tmp

    class Meta:
        db_table = "ansible_host_var"
        unique_together = ("host", "key")


class VaultSecret(models.Model, ModelMixin):
    """Vault 加密变量"""
    name = models.CharField(max_length=100)
    key = models.CharField(max_length=100)
    encrypted_value = EncryptedTextField()
    vault_id = models.CharField(max_length=50, default="default")
    desc = models.CharField(max_length=255, null=True)
    created_at = models.CharField(max_length=20, default=human_datetime)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    updated_at = models.CharField(max_length=20, null=True)

    def to_view(self):
        return self.to_dict(excludes=("encrypted_value",))

    class Meta:
        db_table = "ansible_vault_secret"
        ordering = ("-id",)


class HostFacts(models.Model, ModelMixin):
    """主机 Facts 缓存 (ansible setup 模块输出)"""
    host = models.OneToOneField(Host, on_delete=models.CASCADE, related_name="facts")
    facts = models.TextField(default="{}")
    ansible_version = models.CharField(max_length=50, null=True)
    collected_at = models.CharField(max_length=20, default=human_datetime)

    def to_view(self):
        tmp = self.to_dict(excludes=("facts",))
        try:
            tmp["facts"] = json.loads(self.facts)
        except (json.JSONDecodeError, TypeError):
            tmp["facts"] = {}
        tmp["summary"] = self._extract_summary()
        return tmp

    def _extract_summary(self):
        """提取关键 Facts 用于列表展示"""
        try:
            facts = json.loads(self.facts)
        except (json.JSONDecodeError, TypeError):
            return {}
        return {
            "os": facts.get("ansible_distribution", "") + " " + facts.get("ansible_distribution_version", ""),
            "os_family": facts.get("ansible_os_family", ""),
            "cpu_count": facts.get("ansible_processor_vcpus", ""),
            "memory_mb": round(facts.get("ansible_memtotal_mb", 0)),
            "architecture": facts.get("ansible_architecture", ""),
            "python_version": facts.get("ansible_python_version", ""),
            "kernel": facts.get("ansible_kernel", ""),
            "hostname": facts.get("ansible_hostname", ""),
            "default_ipv4": facts.get("ansible_default_ipv4", {}).get("address", "") if isinstance(facts.get("ansible_default_ipv4"), dict) else "",
        }

    class Meta:
        db_table = "ansible_host_facts"