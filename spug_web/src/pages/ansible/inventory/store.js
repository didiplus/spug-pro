import { observable, computed } from "mobx";
import { http } from 'libs';

class Store {
  @observable tree = [];
  @observable groups = [];
  @observable hosts = [];
  @observable selectedKey = null;
  @observable selectedType = null;
  @observable groupDetail = null;
  @observable hostDetail = null;
  @observable hostVars = [];
  @observable hostVarsFetching = false;
  @observable isFetching = false;
  @observable formVisible = false;
  @observable editingGroup = null;
  @observable previewVisible = false;
  @observable previewContent = '';
  @observable previewFormat = 'ini';
  @observable previewFetching = false;

  @computed get combinedTree() {
    const hostMap = {};
    for (const h of this.hosts) {
      hostMap[h.id] = h;
    }
    const buildNode = (groupNode) => {
      const children = (groupNode.children || []).map(buildNode);
      for (const hid of (groupNode.host_ids || [])) {
        const h = hostMap[hid];
        if (h) {
          children.push({
            key: `host_${h.id}`,
            title: h.name,
            nodeType: 'host',
            hostId: h.id,
            isLeaf: true,
          });
        }
      }
      return {
        key: groupNode.key,
        title: groupNode.title,
        nodeType: 'group',
        host_ids: groupNode.host_ids,
        children,
      };
    };
    return this.tree.map(buildNode);
  }

  fetchTree = () => {
    this.isFetching = true;
    http.get('/api/ansible/inventory/tree/')
      .then(res => this.tree = res)
      .catch(() => {})
      .finally(() => this.isFetching = false)
  };

  fetchGroups = () => {
    http.get('/api/ansible/inventory/')
      .then(res => this.groups = res)
      .catch(() => {})
  };

  fetchHosts = () => {
    http.get('/api/host/')
      .then(res => this.hosts = res)
      .catch(() => {})
  };

  selectGroup = (key) => {
    this.selectedKey = key;
    this.selectedType = 'group';
    const group = this.groups.find(g => g.id === key);
    this.groupDetail = group || null;
  };

  selectHost = (hostId) => {
    this.selectedKey = `host_${hostId}`;
    this.selectedType = 'host';
    this.hostVarsFetching = true;
    http.get(`/api/ansible/host_vars/${hostId}/`)
      .then(res => {
        this.hostDetail = res.host;
        this.hostVars = res.variables;
      })
      .catch(() => {})
      .finally(() => this.hostVarsFetching = false)
  };

  showForm = (info = {}) => {
    this.formVisible = true;
    this.editingGroup = info;
  }

  fetchPreview = () => {
    this.previewFetching = true;
    http.get('/api/ansible/inventory/export/', {params: {preview: true, format: this.previewFormat}})
      .then(res => this.previewContent = res.content || '')
      .catch(() => {})
      .finally(() => this.previewFetching = false)
  }

  showPreview = (format = 'ini') => {
    this.previewFormat = format;
    this.previewVisible = true;
    this.fetchPreview();
  }

  moveHostToGroup = (hostId, targetGroupId) => {
    const updates = [];
    for (const g of this.groups) {
      const currentIds = g.hosts || [];
      if (currentIds.includes(hostId) && g.id !== targetGroupId) {
        const newIds = currentIds.filter(id => id !== hostId);
        updates.push({id: g.id, host_ids: newIds});
      } else if (!currentIds.includes(hostId) && g.id === targetGroupId) {
        updates.push({id: g.id, host_ids: [...currentIds, hostId]});
      }
    }
    if (updates.length === 0) return Promise.resolve();
    return Promise.all(updates.map(u => http.patch('/api/ansible/inventory/', u)))
      .then(() => {
        this.fetchTree();
        this.fetchGroups();
      })
  }
}

export default new Store();
