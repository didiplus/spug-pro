from django.urls import re_path
from apps.pipeline.views.pipeline import (
    PipelineView, PipelineDoView, PipelineHistoryView, PipelineHistoryDetailView, PipelineUploadView
)

urlpatterns = [
    re_path(r"^$", PipelineView.as_view()),
    re_path(r"^do/$", PipelineDoView.as_view()),
    re_path(r"^history/$", PipelineHistoryView.as_view()),
    re_path(r"^history/(?P<h_id>\d+)/$", PipelineHistoryDetailView.as_view()),
    re_path(r"^upload/$", PipelineUploadView.as_view()),
]
