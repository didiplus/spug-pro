/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import { observable, computed } from 'mobx';
import { http } from 'libs';
import { message } from 'libs/message';
import HostBaseStore from './baseStore';

class Store extends HostBaseStore {
  @observable rawTreeData = [];
  @observable rawRecords = [];
  @observable groups = {};
  @observable group = {};
  @observable record = {};
  @observable idMap = {};
  @observable addByCopy = true;
  @observable grpFetching = true;
  @observable isFetching = false;
  @observable formVisible = false;
  @observable importVisible = false;
  @observable syncVisible = false;
  @observable cloudImport = null;
  @observable detailVisible = false;
  @observable selectorVisible = false;

  @observable f_word;
  @observable f_status = '';

  @computed get dataSource() {
    let records = [];
    if (this.group.key) {
      const host_ids = this.counter[this.group.key]
      records = this.records.filter(x => host_ids && host_ids.has(x.id));
    }
    if (this.f_status !== '') records = records.filter(x => this.f_status === x.is_verified);
    return records
  }

  fetchRecords = () => {
    this.isFetching = true;
    return http.get('/api/host/')
      .then(res => {
        const tmp = {};
        this.rawRecords = res;
        this.rawRecords.map(item => tmp[item.id] = item);
        this.idMap = tmp;
      })
      .finally(() => this.isFetching = false)
  };

  fetchExtend = (id) => {
    return http.put('/api/host/', {id})
      .then(res => {
        if (res) {
          const idx = this.rawRecords.findIndex(x => x.id === id);
          if (idx >= 0) {
            this.rawRecords[idx] = {...this.rawRecords[idx], ...res};
            this.rawRecords = [...this.rawRecords];
          }
        }
      })
  }

  fetchGroups = () => {
    this.grpFetching = true;
    return http.get('/api/host/group/')
      .then(res => {
        this.groups = res.groups;
        this.rawTreeData = res.treeData
      })
      .finally(() => this.grpFetching = false)
  }

  initial = () => {
    if (this.rawRecords.length > 0) return Promise.resolve()
    this.isFetching = true;
    this.grpFetching = true;
    return http.all([http.get('/api/host/'), http.get('/api/host/group/')])
      .then(http.spread((res1, res2) => {
        this.rawRecords = res1;
        this.rawRecords.map(item => this.idMap[item.id] = item);
        this.groups = res2.groups;
        this.rawTreeData = res2.treeData;
        this.group = this.treeData[0] || {};
      }))
      .finally(() => {
        this.isFetching = false;
        this.grpFetching = false
      })
  }

  updateGroup = (group, host_ids) => {
    const form = {host_ids, s_group_id: group.key, t_group_id: this.group.key, is_copy: this.addByCopy};
    return http.patch('/api/host/', form)
      .then(() => {
        message.success('操作成功');
        this.fetchRecords()
      })
  }

  showForm = (info = {}) => {
    this.formVisible = true;
    this.record = info
  }

  showSync = () => {
    this.syncVisible = !this.syncVisible
  }

  showDetail = (info) => {
    this.record = info;
    this.detailVisible = true;
  }

  showSelector = (addByCopy) => {
    this.addByCopy = addByCopy;
    this.selectorVisible = true;
  }
}

export default new Store()
