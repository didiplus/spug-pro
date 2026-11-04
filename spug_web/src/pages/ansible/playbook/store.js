import { observable } from "mobx";
import { http, includes } from 'libs';

class Store {
  @observable records = [];
  @observable record = {};
  @observable isFetching = false;
  @observable formVisible = false;
  @observable runVisible = false;
  @observable historyVisible = false;
  @observable histories = [];
  @observable historyFetching = false;
  @observable runToken = null;
  @observable showOutput = false;

  @observable f_name;
  @observable f_status;
  @observable f_tag;

  get dataSource() {
    let data = this.records;
    if (this.f_name) data = data.filter(x => includes(x.name, this.f_name));
    if (this.f_status === 'active') data = data.filter(x => x.is_active);
    if (this.f_status === 'inactive') data = data.filter(x => !x.is_active);
    if (this.f_tag) data = data.filter(x => x.tags && x.tags.split(',').map(t => t.trim()).includes(this.f_tag));
    return data;
  }

  get allTags() {
    const tagSet = new Set();
    this.records.forEach(r => {
      if (r.tags) r.tags.split(',').forEach(t => { const v = t.trim(); if (v) tagSet.add(v); });
    });
    return Array.from(tagSet).sort();
  }

  fetchRecords = () => {
    this.isFetching = true;
    http.get('/api/ansible/playbooks/')
      .then(res => this.records = res)
      .catch(() => {})
      .finally(() => this.isFetching = false)
  };

  showForm = (info = {}) => {
    this.formVisible = true;
    this.record = info;
  };

  showRun = (info) => {
    this.runVisible = true;
    this.record = info;
  };

  showHistory = (info) => {
    this.historyVisible = true;
    this.record = info;
    this.historyFetching = true;
    http.get('/api/ansible/playbooks/history/', {params: {playbook_id: info.id, size: 50}})
      .then(res => this.histories = res.data)
      .catch(() => {})
      .finally(() => this.historyFetching = false)
  };

  switchOutput = (token) => {
    if (this.showOutput) {
      this.showOutput = false;
      this.runToken = null;
    } else {
      this.runToken = token;
      this.showOutput = true;
    }
  }
}

export default new Store();