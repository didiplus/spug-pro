# models.py
from django.db import models
from libs import ModelMixin, human_datetime
from libs.fields import EncryptedTextField
from apps.account.models import User
class DatabaseInstance(models.Model,ModelMixin):
    TYPE_CHOICES = (
        ("mysql", "MySQL"),
        ("postgresql", "PostgreSQL"),
        ("redis", "Redis"),
    )

    name = models.CharField(
        max_length=100,
        unique=True,
        #db_comment="实例名称，必须唯一"
    )
    type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default="mysql",
        #db_comment="数据库类型：mysql / postgresql / redis"
    )
    host = models.CharField(
        max_length=128,
        #db_comment="数据库主机地址，IP或域名"
    )
    port = models.IntegerField(
        default=3306,
        #db_comment="数据库端口，默认为3306"
    )
    username = models.CharField(
        max_length=64,
        null=True
        #db_comment="数据库连接用户名"
    )
    password = EncryptedTextField(
        null=True
        #db_comment="数据库密码（加密存储）"
    )
    version = models.CharField(
        max_length=50,
        blank=True,
        #db_comment="数据库版本号，如 '8.0.30'"
    )
    charset = models.CharField(
        max_length=30,
        default="utf8mb4",
        #db_comment="数据库字符集，如 utf8mb4"
    )
    status = models.IntegerField(
        default=0,
    )
    cluster = models.CharField(
        max_length=100,
        null=True,
        blank=True,
    )
    created_at = models.CharField(
        max_length=20,
        default=human_datetime,
        #db_comment="创建时间（自动生成）"
    )
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
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

    instance = models.ForeignKey(DatabaseInstance, on_delete=models.CASCADE, related_name="backups")
    database = models.CharField(max_length=100, null=True, blank=True)
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default="full")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    file_path = models.CharField(max_length=500, null=True, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    duration = models.IntegerField(null=True, blank=True)
    remark = models.CharField(max_length=255, null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    created_at = models.CharField(max_length=20, default=human_datetime)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+", null=True, blank=True)

    class Meta:
        db_table = "database_backup"
        ordering = ("-id",)


class SQLExecutionHistory(models.Model, ModelMixin):
    instance = models.ForeignKey(DatabaseInstance, on_delete=models.CASCADE, related_name="sql_histories")
    database = models.CharField(max_length=100, null=True, blank=True)
    sql = models.TextField()
    status = models.CharField(max_length=20, default="success")
    affected = models.IntegerField(null=True, blank=True)
    rows_count = models.IntegerField(null=True, blank=True)
    duration = models.IntegerField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    created_at = models.CharField(max_length=20, default=human_datetime)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "database_sql_history"
        ordering = ("-id",)