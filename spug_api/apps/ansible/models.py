# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.db import models
from libs import ModelMixin, human_datetime
from libs.fields import EncryptedTextField
from apps.account.models import User
from apps.host.models import Host
import json
import logging

logger = logging.getLogger(__name__)


def _safe_json(value, default):
    try:
        return json.loads(value) if value else default
    except (json.JSONDecodeError, TypeError):
        return default


# ============================== Inventory ==============================

class InventoryGroup(models.Model, ModelMixin):
    """Ansible Inventory 分组，支持嵌套子组和组变量"""
    name = models.CharField(max_length=100, verbose_name="分组名称")
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, related_name="children", verbose_name="父分组")
    hosts = models.ManyToManyField(Host, related_name="inventory_groups", verbose_name="关联主机")
    variables = models.TextField(default="{}", verbose_name="组变量")
    children_pattern = models.CharField(max_length=255, null=True, verbose_name="子组匹配模式")
    sort_id = models.IntegerField(default=0, verbose_name="排序ID")

    def to_view(self, with_hosts=False):
        tmp = self.to_dict(excludes=("variables",))
        tmp["variables"] = _safe_json(self.variables, {})
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
    host = models.ForeignKey(Host, on_delete=models.CASCADE, related_name="variables", verbose_name="关联主机")
    key = models.CharField(max_length=100, verbose_name="变量名")
    value = EncryptedTextField(verbose_name="变量值")
    value_type = models.CharField(max_length=20, default="string", choices=VALUE_TYPES, verbose_name="值类型")
    is_vault = models.BooleanField(default=False, verbose_name="是否Vault加密")
    updated_at = models.CharField(max_length=20, default=human_datetime, verbose_name="更新时间")

    def to_view(self):
        tmp = self.to_dict()
        if self.is_vault:
            tmp["value"] = "******"
            return tmp
        if self.value_type == "json":
            tmp["value"] = _safe_json(self.value, self.value)
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


# ============================== Vault ==============================

class VaultSecret(models.Model, ModelMixin):
    """Vault 加密变量"""
    name = models.CharField(max_length=100, verbose_name="名称")
    key = models.CharField(max_length=100, verbose_name="变量名")
    encrypted_value = EncryptedTextField(verbose_name="加密值")
    vault_id = models.CharField(max_length=50, default="default", verbose_name="Vault ID")
    host_ids = models.TextField(default="[]", verbose_name="关联主机ID列表")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")

    def to_view(self):
        tmp = self.to_dict(excludes=("encrypted_value",))
        tmp["host_ids"] = _safe_json(self.host_ids, [])
        return tmp

    class Meta:
        db_table = "ansible_vault_secret"
        ordering = ("-id",)


# ============================== Facts ==============================

class HostFacts(models.Model, ModelMixin):
    """主机 Facts 缓存 (ansible setup 模块输出)"""
    host = models.OneToOneField(Host, on_delete=models.CASCADE, related_name="facts", verbose_name="关联主机")
    facts = models.TextField(default="{}", verbose_name="Facts数据")
    ansible_version = models.CharField(max_length=50, null=True, verbose_name="Ansible版本")
    collected_at = models.CharField(max_length=20, default=human_datetime, verbose_name="采集时间")

    def to_view(self):
        tmp = self.to_dict(excludes=("facts",))
        tmp["facts"] = _safe_json(self.facts, {})
        tmp["summary"] = self._extract_summary()
        return tmp

    def _extract_summary(self):
        """提取关键 Facts 用于列表展示"""
        facts = _safe_json(self.facts, {})
        if not facts:
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


# ============================== Role ==============================

class Role(models.Model, ModelMixin):
    """Ansible Role 定义"""
    name = models.CharField(max_length=100, verbose_name="名称")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    path = models.CharField(max_length=255, verbose_name="路径")
    requirements = models.TextField(null=True, verbose_name="依赖要求")
    is_active = models.BooleanField(default=True, verbose_name="启用状态")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")

    class Meta:
        db_table = "ansible_role"
        ordering = ("-id",)


class RoleSource(models.Model, ModelMixin):
    """Role 源（应用市场条目），支持从 GitHub/Galaxy 加载 Ansible Role"""
    SOURCE_TYPES = (
        ("github", "GitHub"),
        ("galaxy", "Ansible Galaxy"),
        ("local", "本地"),
    )
    STATUS_CHOICES = (
        ("pending", "待安装"),
        ("installing", "安装中"),
        ("installed", "已安装"),
        ("failed", "安装失败"),
    )

    name = models.CharField(max_length=100, verbose_name="Role 名称")
    source_type = models.CharField(max_length=20, default="github", choices=SOURCE_TYPES, verbose_name="源类型")
    source_url = models.CharField(max_length=500, verbose_name="源地址")
    branch = models.CharField(max_length=100, default="main", verbose_name="分支/Tag")
    namespace = models.CharField(max_length=100, null=True, verbose_name="命名空间")

    author = models.CharField(max_length=200, null=True, verbose_name="作者")
    description = models.TextField(null=True, verbose_name="描述")
    min_ansible_version = models.CharField(max_length=20, null=True, verbose_name="最低Ansible版本")
    platforms = models.TextField(default="[]", verbose_name="支持平台")
    dependencies = models.TextField(default="[]", verbose_name="Role依赖")
    categories = models.CharField(max_length=255, null=True, verbose_name="分类标签")
    variables_schema = models.TextField(default="[]", verbose_name="变量表单定义")
    readme = models.TextField(null=True, verbose_name="README")

    local_path = models.CharField(max_length=500, null=True, verbose_name="本地缓存路径")
    installed_commit = models.CharField(max_length=40, null=True, verbose_name="已安装commit")
    install_status = models.CharField(max_length=20, default="pending", choices=STATUS_CHOICES, verbose_name="安装状态")
    install_error = models.TextField(null=True, verbose_name="安装错误信息")
    is_active = models.BooleanField(default=True, verbose_name="启用状态")

    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")

    def to_view(self):
        tmp = self.to_dict(excludes=("platforms", "dependencies", "variables_schema", "readme", "install_error"))
        tmp["platforms"] = _safe_json(self.platforms, [])
        tmp["dependencies"] = _safe_json(self.dependencies, [])
        tmp["variables_schema"] = _safe_json(self.variables_schema, [])
        tmp["has_readme"] = bool(self.readme)
        return tmp

    def to_detail(self):
        tmp = self.to_dict(excludes=("platforms", "dependencies", "variables_schema"))
        tmp["platforms"] = _safe_json(self.platforms, [])
        tmp["dependencies"] = _safe_json(self.dependencies, [])
        tmp["variables_schema"] = _safe_json(self.variables_schema, [])
        return tmp

    class Meta:
        db_table = "ansible_role_source"
        ordering = ("-id",)


class RoleDeployment(models.Model, ModelMixin):
    """Role 部署记录，一次部署 = RoleSource + 目标主机 + 变量"""
    STATUS_CHOICES = (
        ("pending", "待执行"),
        ("running", "执行中"),
        ("success", "成功"),
        ("failed", "失败"),
    )

    role_source = models.ForeignKey(RoleSource, on_delete=models.CASCADE, related_name="deployments", verbose_name="Role源")
    name = models.CharField(max_length=100, verbose_name="部署名称")
    host_ids = models.TextField(verbose_name="目标主机")
    group_id = models.IntegerField(null=True, verbose_name="Inventory分组ID")
    variables = models.TextField(default="{}", verbose_name="部署变量")
    run_token = models.CharField(max_length=32, null=True, db_index=True, verbose_name="执行令牌")
    status = models.CharField(max_length=20, default="pending", choices=STATUS_CHOICES, verbose_name="状态")
    duration = models.IntegerField(default=0, verbose_name="耗时(秒)")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")

    def to_view(self):
        tmp = self.to_dict(excludes=("variables", "host_ids"))
        tmp["variables"] = _safe_json(self.variables, {})
        tmp["host_ids"] = _safe_json(self.host_ids, [])
        tmp["role_name"] = self.role_source.name if self.role_source_id else None
        return tmp

    class Meta:
        db_table = "ansible_role_deployment"
        ordering = ("-id",)


# ============================== Playbook ==============================

class Playbook(models.Model, ModelMixin):
    """Ansible Playbook 定义"""
    name = models.CharField(max_length=100, verbose_name="名称")
    desc = models.CharField(max_length=255, null=True, verbose_name="描述")
    content = models.TextField(verbose_name="Playbook内容")
    extra_vars = models.TextField(default="{}", verbose_name="额外变量")

    group_id = models.IntegerField(null=True, verbose_name="分组ID")
    tags = models.CharField(max_length=255, null=True, verbose_name="标签")
    forks = models.IntegerField(default=0, verbose_name="并发数")
    timeout = models.IntegerField(default=0, verbose_name="超时(秒)")
    is_active = models.BooleanField(default=True, verbose_name="启用状态")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", null=True, verbose_name="更新人")

    def to_view(self):
        tmp = self.to_dict()
        tmp["extra_vars"] = _safe_json(self.extra_vars, {})
        return tmp

    class Meta:
        db_table = "playbook"
        ordering = ("-id",)


class PlaybookRun(models.Model, ModelMixin):
    """Playbook 执行记录"""
    STATUS_CHOICES = (
        ("running", "执行中"),
        ("success", "成功"),
        ("failed", "失败"),
        ("canceled", "已取消"),
    )
    playbook = models.ForeignKey(Playbook, on_delete=models.CASCADE, related_name="runs", verbose_name="Playbook")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+", verbose_name="执行用户")
    token = models.CharField(max_length=32, db_index=True, verbose_name="执行令牌")
    host_ids = models.TextField(verbose_name="目标主机")
    extra_vars = models.TextField(default="{}", verbose_name="额外变量")
    run_tags = models.CharField(max_length=255, null=True, verbose_name="运行标签")
    skip_tags = models.CharField(max_length=255, null=True, verbose_name="跳过标签")
    check_mode = models.BooleanField(default=False, verbose_name="检查模式")
    status = models.CharField(max_length=20, default="running", choices=STATUS_CHOICES, verbose_name="状态")
    stats = models.TextField(default="{}", verbose_name="执行统计")
    duration = models.IntegerField(default=0, verbose_name="耗时(秒)")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")

    def to_view(self):
        tmp = self.to_dict()
        tmp["extra_vars"] = _safe_json(self.extra_vars, {})
        tmp["stats"] = _safe_json(self.stats, {})
        tmp["host_ids"] = _safe_json(self.host_ids, [])
        return tmp

    class Meta:
        db_table = "playbook_run"
        ordering = ("-id",)


class PlaybookVersion(models.Model, ModelMixin):
    """Playbook 版本历史"""
    playbook = models.ForeignKey(Playbook, on_delete=models.CASCADE, related_name="versions", verbose_name="Playbook")
    version = models.IntegerField(verbose_name="版本号")
    content = models.TextField(verbose_name="Playbook内容")
    extra_vars = models.TextField(default="{}", verbose_name="额外变量")
    change_desc = models.CharField(max_length=255, null=True, verbose_name="变更说明")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")

    def to_view(self):
        tmp = self.to_dict(excludes=("content", "extra_vars"))
        tmp["extra_vars"] = _safe_json(self.extra_vars, {})
        tmp["content_length"] = len(self.content) if self.content else 0
        tmp["created_by_name"] = self.created_by.username if self.created_by else None
        return tmp

    class Meta:
        db_table = "playbook_version"
        ordering = ("-version",)
