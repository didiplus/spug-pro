from django.urls import path
from apps.database.views import *





urlpatterns = [
    path('instances/', DatabaseInstanceView.as_view(), name='instance-list'),
    path('instances/<int:id>/', DatabaseInstanceView.as_view(), name='instance-detail'),
    path('instances/<int:instance_id>/slow-queries/', slow_queries),
    path('instances/<int:instance_id>/backups/', backup_list),
    path('instances/<int:instance_id>/backups/cleanup/', cleanup_backups),
    path('instances/<int:instance_id>/backups/<int:backup_id>/', backup_detail),
    path('instances/<int:instance_id>/backups/<int:backup_id>/download/', backup_download),
    path('instances/<int:instance_id>/backups/<int:backup_id>/status/', backup_status),
    path('instances/<int:instance_id>/retention-policy/', retention_policy),
    path('instances/<int:instance_id>/sql-history/', sql_history_list),
    path('instances/<int:instance_id>/sql-history/<int:history_id>/', sql_history_detail),

    path('test/', test_connection_databases),
    path('execute/', execute_sql),

    path('clusters/', cluster_list),
    path('clusters/auto-discover/', cluster_auto_discover),
    path('clusters/<str:cluster_name>/topology/', cluster_topology),
    path('clusters/<str:cluster_name>/discover/', cluster_discover),
    path('clusters/<str:cluster_name>/health/', cluster_health),

    path('instances/health-check/', health_check),
    path('instances/<int:instance_id>/test/', instance_test),
]