# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.urls import path

from .views import *
from .dashboard_views import DashboardView, DashboardDetailView, DashboardQueryView

urlpatterns = [
    path('', DetectionView.as_view()),
    path('overview/', get_overview),
    path('test/', run_test),
    path('dashboard/', DashboardView.as_view()),
    path('dashboard/<int:pk>/', DashboardDetailView.as_view()),
    path('dashboard/query/', DashboardQueryView.as_view()),
]
