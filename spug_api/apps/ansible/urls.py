# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Released under the AGPL-3.0 License.
from django.urls import re_path

from apps.ansible.views.inventory import (
    InventoryView, InventoryTreeView, HostVarView,
)
from apps.ansible.views.vault import (
    VaultView, VaultDecryptView,
)
from apps.ansible.views.facts import (
    FactsView, FactsCollectView,
)
from apps.ansible.views.module import (
    ModuleView,
)
from apps.ansible.views.role import (
    RoleView, RoleInstallView,
    RoleMarketView, RoleMarketDetailView, RoleMarketInstallView,
    RoleMarketDeployView, RoleDeploymentView,
)
from apps.ansible.views.playbook import (
    PlaybookView, PlaybookValidateView, PlaybookRunView,
    PlaybookHistoryView, PlaybookStatsView,
    PlaybookVersionView, PlaybookVersionDetailView,
    PlaybookRollbackView, PlaybookDiffView,
)

urlpatterns = [
    # Inventory
    re_path(r"^inventory/$", InventoryView.as_view()),
    re_path(r"^inventory/tree/$", InventoryTreeView.as_view()),
    re_path(r"^host_vars/(?P<host_id>\d+)/$", HostVarView.as_view()),
    # Vault
    re_path(r"^vault/$", VaultView.as_view()),
    re_path(r"^vault/decrypt/$", VaultDecryptView.as_view()),
    # Facts
    re_path(r"^facts/$", FactsView.as_view()),
    re_path(r"^facts/(?P<host_id>\d+)/$", FactsView.as_view()),
    re_path(r"^facts/collect/$", FactsCollectView.as_view()),
    # Modules
    re_path(r"^modules/$", ModuleView.as_view()),
    re_path(r"^modules/(?P<name>[\w.]+)/$", ModuleView.as_view()),
    # Roles
    re_path(r"^roles/$", RoleView.as_view()),
    re_path(r"^roles/install/$", RoleInstallView.as_view()),
    re_path(r"^roles/market/$", RoleMarketView.as_view()),
    re_path(r"^roles/market/(?P<rid>\d+)/$", RoleMarketDetailView.as_view()),
    re_path(r"^roles/market/(?P<rid>\d+)/install/$", RoleMarketInstallView.as_view()),
    re_path(r"^roles/market/(?P<rid>\d+)/deploy/$", RoleMarketDeployView.as_view()),
    re_path(r"^roles/deployments/$", RoleDeploymentView.as_view()),
    # Playbooks
    re_path(r"^playbooks/$", PlaybookView.as_view()),
    re_path(r"^playbooks/validate/$", PlaybookValidateView.as_view()),
    re_path(r"^playbooks/run/$", PlaybookRunView.as_view()),
    re_path(r"^playbooks/history/$", PlaybookHistoryView.as_view()),
    re_path(r"^playbooks/stats/(?P<token>\w+)/$", PlaybookStatsView.as_view()),
    re_path(r"^playbooks/versions/$", PlaybookVersionView.as_view()),
    re_path(r"^playbooks/versions/(?P<version_id>\d+)/$", PlaybookVersionDetailView.as_view()),
    re_path(r"^playbooks/rollback/$", PlaybookRollbackView.as_view()),
    re_path(r"^playbooks/diff/$", PlaybookDiffView.as_view()),
]
