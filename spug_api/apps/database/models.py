# models.py
from django.db import models
from libs import ModelMixin, human_datetime
from libs.fields import EncryptedTextField
from apps.account.models import User
class DatabaseInstance(models.Model,ModelMixin):
    TYPE_CHOICES = (
        ("mysql", "MySQL"),
        ("mariadb", "MariaDB"),
        ("postgresql", "PostgreSQL"),
        ("tidb", "TiDB"),
        ("redis", "Redis"),
        ("mongodb", "MongoDB"),
        ("mssql", "SQL Server"),
        ("oracle", "Oracle"),
        ("sqlite", "SQLite"),
        ("clickhouse", "ClickHouse"),
        ("elasticsearch", "Elasticsearch"),
        ("cassandra", "Cassandra"),
    )

    name = models.CharField(
        max_length=100,
        unique=True,
        verbose_name="实例名称",
    )
    type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default="mysql",
        verbose_name="数据库类型",
    )
    host = models.CharField(
        max_length=128,
        verbose_name="主机地址",
    )
    port = models.IntegerField(
        default=3306,
        verbose_name="端口",
    )
    username = models.CharField(
        max_length=64,
        null=True,
        verbose_name="用户名",
    )
    password = EncryptedTextField(
        null=True,
        verbose_name="密码",
    )
    version = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="版本号",
    )
    charset = models.CharField(
        max_length=30,
        default="utf8mb4",
        verbose_name="字符集",
    )
    status = models.IntegerField(
        default=0,
        verbose_name="状态",
    )
    cluster = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        verbose_name="集群名称",
    )
    created_at = models.CharField(
        max_length=20,
        default=human_datetime,
        verbose_name="创建时间",
    )
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")
    class Meta:
        db_table = "database_instance"


class DatabaseBackup(models.Model, ModelMixin):
    MODE_CHOICES = (
        ("full", "全量备份"),
        ("incremental", "增量备份"),
    )
    STATUS_CHOICES = (
        ("pending", "等待中"),
        ("running", "备份中"),
        ("success", "成功"),
        ("failed", "失败"),
    )

    instance = models.ForeignKey(DatabaseInstance, on_delete=models.CASCADE, related_name="backups", verbose_name="数据库实例")
    database = models.CharField(max_length=100, null=True, blank=True, verbose_name="数据库名")
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default="full", verbose_name="备份模式")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending", verbose_name="状态")
    file_path = models.CharField(max_length=500, null=True, blank=True, verbose_name="文件路径")
    file_size = models.BigIntegerField(null=True, blank=True, verbose_name="文件大小")
    duration = models.IntegerField(null=True, blank=True, verbose_name="耗时(秒)")
    remark = models.CharField(max_length=255, null=True, blank=True, verbose_name="备注")
    error_message = models.TextField(null=True, blank=True, verbose_name="错误信息")
    progress = models.IntegerField(default=0, verbose_name="进度")
    task_id = models.CharField(max_length=64, null=True, blank=True, verbose_name="任务ID")
    storage_config = models.ForeignKey(
        'setting.StorageConfig', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='backups', verbose_name="存储配置"
    )
    remote_path = models.CharField(max_length=500, null=True, blank=True, verbose_name="远程路径")
    storage_status = models.CharField(max_length=20, null=True, blank=True, verbose_name="存储状态")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", null=True, blank=True, verbose_name="创建人")

    class Meta:
        db_table = "database_backup"
        ordering = ("-id",)


class RetentionPolicy(models.Model, ModelMixin):
    STRATEGY_CHOICES = (
        ("count", "按数量保留"),
        ("time", "按时间保留"),
        ("gfs", "GFS 祖父-父-子"),
    )

    instance = models.ForeignKey(DatabaseInstance, on_delete=models.CASCADE, related_name="retention_policies", verbose_name="数据库实例")
    strategy_type = models.CharField(max_length=20, choices=STRATEGY_CHOICES, default="count", verbose_name="保留策略")
    keep_count = models.IntegerField(default=30, verbose_name="保留数量")
    keep_days = models.IntegerField(default=7, verbose_name="保留天数")
    keep_weekly = models.IntegerField(default=4, verbose_name="保留周数")
    keep_monthly = models.IntegerField(default=12, verbose_name="保留月数")
    enabled = models.BooleanField(default=True, verbose_name="启用状态")
    auto_cleanup = models.BooleanField(default=True, verbose_name="自动清理")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    updated_at = models.CharField(max_length=20, null=True, verbose_name="更新时间")

    class Meta:
        db_table = "database_retention_policy"


class SQLExecutionHistory(models.Model, ModelMixin):
    instance = models.ForeignKey(DatabaseInstance, on_delete=models.CASCADE, related_name="sql_histories", verbose_name="数据库实例")
    database = models.CharField(max_length=100, null=True, blank=True, verbose_name="数据库名")
    sql = models.TextField(verbose_name="SQL语句")
    status = models.CharField(max_length=20, default="success", verbose_name="状态")
    affected = models.IntegerField(null=True, blank=True, verbose_name="影响行数")
    rows_count = models.IntegerField(null=True, blank=True, verbose_name="返回行数")
    duration = models.IntegerField(null=True, blank=True, verbose_name="耗时(毫秒)")
    error_message = models.TextField(null=True, blank=True, verbose_name="错误信息")
    created_at = models.CharField(max_length=20, default=human_datetime, verbose_name="创建时间")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", verbose_name="创建人")

    class Meta:
        db_table = "database_sql_history"
        ordering = ("-id",)