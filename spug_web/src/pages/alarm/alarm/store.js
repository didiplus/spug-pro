/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import { observable, computed } from 'mobx';
import http from 'libs/http';

class Store {
  @observable records = [];
  @observable isFetching = false;

  @observable f_name;
  @observable f_status = '';
  @observable f_grouped = false;
  @observable trendData = null;
  @observable trendLoading = false;

  @computed get dataSource() {
    let records = this.records;
    if (this.f_name) records = records.filter(x => x.name.toLowerCase().includes(this.f_name.toLowerCase()));
    if (this.f_status) records = records.filter(x => {
      const status = this.f_grouped ? x.latest_status : x.status;
      return status === this.f_status;
    });
    return records
  }

  fetchRecords = () => {
    this.isFetching = true;
    const params = {};
    if (this.f_grouped) params.group_by = 'fingerprint';
    http.get('/api/alarm/alarm/', {params})
      .then(res => this.records = res)
      .finally(() => this.isFetching = false)
  };

  fetchTrend = (hours = 24) => {
    this.trendLoading = true;
    http.get('/api/alarm/trend/', {params: {hours}})
      .then(res => this.trendData = res)
      .finally(() => this.trendLoading = false)
  };
}

export default new Store()
