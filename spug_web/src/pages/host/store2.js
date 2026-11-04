/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import { observable, computed } from 'mobx';
import HostBaseStore from './baseStore';

class Store extends HostBaseStore {
  @observable rawTreeData = [];
  @observable rawRecords = [];
  @observable group = {};
  @observable onlySelf = false;

  @observable f_word;

  @computed get dataSource() {
    let records = [];
    if (this.group.key) {
      const host_ids = this.counter[this.group.key]
      records = this.records.filter(x => host_ids && host_ids.has(x.id));
    }
    return records
  }
}

export default new Store()
