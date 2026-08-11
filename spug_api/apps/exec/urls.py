# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.urls import re_path

from apps.exec.views import *
from apps.exec.transfer import TransferView
from apps.exec.inspect import (
    InspectItemView, InspectItemTestView, InspectTaskView,
    InspectRunView, InspectResultView, InspectReportView,
)

urlpatterns = [
    re_path(r"template/$", TemplateView.as_view()),
    re_path(r"do/$", TaskView.as_view()),
    re_path(r"transfer/$", TransferView.as_view()),
    re_path(r"inspect/item/$", InspectItemView.as_view()),
    re_path(r"inspect/item/test/$", InspectItemTestView.as_view()),
    re_path(r"inspect/task/$", InspectTaskView.as_view()),
    re_path(r"inspect/run/$", InspectRunView.as_view()),
    re_path(r"inspect/result/$", InspectResultView.as_view()),
    re_path(r"inspect/report/$", InspectReportView.as_view()),
]
