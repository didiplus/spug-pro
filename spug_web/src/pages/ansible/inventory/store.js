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
      .finally(() => this.isFetching = false)
  };

  fetchGroups = () => {
    http.get('/api/ansible/inventory/')
      .then(res => this.groups = res)
  };

  fetchHosts = () => {
    http.get('/api/host/')
      .then(res => this.hosts = res)
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
      .finally(() => this.hostVarsFetching = false)
  };

  showForm = (info = {}) => {
    this.formVisible = true;
    this.editingGroup = info;
  }
}

export default new Store();
