# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.urls import re_path

from apps.playbook.views import (
    PlaybookView, PlaybookValidateView, PlaybookRunView,
    PlaybookHistoryView, PlaybookStatsView,
    PlaybookVersionView, PlaybookVersionDetailView,
    PlaybookRollbackView, PlaybookDiffView,
)

urlpatterns = [
    re_path(r"^$", PlaybookView.as_view()),
    re_path(r"^validate/$", PlaybookValidateView.as_view()),
    re_path(r"^run/$", PlaybookRunView.as_view()),
    re_path(r"^history/$", PlaybookHistoryView.as_view()),
    re_path(r"^stats/(?P<token>\w+)/$", PlaybookStatsView.as_view()),
    re_path(r"^versions/$", PlaybookVersionView.as_view()),
    re_path(r"^versions/(?P<version_id>\d+)/$", PlaybookVersionDetailView.as_view()),
    re_path(r"^rollback/$", PlaybookRollbackView.as_view()),
    re_path(r"^diff/$", PlaybookDiffView.as_view()),
]
