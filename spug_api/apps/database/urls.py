from django.urls import path
from apps.database.views import *





urlpatterns = [
    path('instances/', DatabaseInstanceView.as_view(), name='instance-list'),
    path('instances/<int:id>/', DatabaseInstanceView.as_view(), name='instance-detail'),
    path('instances/<int:instance_id>/slow-queries/', slow_queries),
    path('instances/<int:instance_id>/backups/', backup_list),
    path('instances/<int:instance_id>/backups/<int:backup_id>/', backup_detail),
    path('instances/<int:instance_id>/backups/<int:backup_id>/download/', backup_download),
    path('instances/<int:instance_id>/sql-history/', sql_history_list),
    path('instances/<int:instance_id>/sql-history/<int:history_id>/', sql_history_detail),

    path('test/', test_connection_databases),
    path('execute/', execute_sql),
]