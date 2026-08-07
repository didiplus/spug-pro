# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.urls import re_path

from apps.ansible.views import (
    InventoryView, InventoryTreeView, HostVarView,
    VaultView, VaultDecryptView,
    FactsView, FactsCollectView,
    ModuleView, RoleView, RoleInstallView,
)

urlpatterns = [
    re_path(r"^inventory/$", InventoryView.as_view()),
    re_path(r"^inventory/tree/$", InventoryTreeView.as_view()),
    re_path(r"^host_vars/(?P<host_id>\d+)/$", HostVarView.as_view()),
    re_path(r"^vault/$", VaultView.as_view()),
    re_path(r"^vault/decrypt/$", VaultDecryptView.as_view()),
    re_path(r"^facts/$", FactsView.as_view()),
    re_path(r"^facts/(?P<host_id>\d+)/$", FactsView.as_view()),
    re_path(r"^facts/collect/$", FactsCollectView.as_view()),
    re_path(r"^modules/$", ModuleView.as_view()),
    re_path(r"^modules/(?P<name>[\w.]+)/$", ModuleView.as_view()),
    re_path(r"^roles/$", RoleView.as_view()),
    re_path(r"^roles/install/$", RoleInstallView.as_view()),
]
