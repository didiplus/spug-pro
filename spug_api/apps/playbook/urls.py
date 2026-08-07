# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.urls import re_path

from apps.playbook.views import (
    PlaybookView, PlaybookValidateView, PlaybookRunView,
    PlaybookHistoryView, PlaybookStatsView,
)

urlpatterns = [
    re_path(r"^$", PlaybookView.as_view()),
    re_path(r"^validate/$", PlaybookValidateView.as_view()),
    re_path(r"^run/$", PlaybookRunView.as_view()),
    re_path(r"^history/$", PlaybookHistoryView.as_view()),
    re_path(r"^stats/(?P<token>\w+)/$", PlaybookStatsView.as_view()),
]
