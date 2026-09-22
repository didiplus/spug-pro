# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from apps.ansible.views.inventory import InventoryView, InventoryTreeView, HostVarView
from apps.ansible.views.vault import VaultView, VaultDecryptView
from apps.ansible.views.facts import FactsView, FactsCollectView
from apps.ansible.views.module import ModuleView
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