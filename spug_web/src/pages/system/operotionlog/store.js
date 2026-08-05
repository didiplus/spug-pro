import { observable, action, runInAction } from 'mobx';
import { http } from 'libs';

class Store {
  @observable records = [];
  @observable isFetching = false;
  @observable total = 0;
  @observable current = 1;
  @observable pageSize = 10;

  @observable f_name = '';
  @observable f_ip = '';
  @observable f_status = '';
  @observable f_module = '';

  @action
  fetchRecords = () => {
    this.isFetching = true;
    const params = {
      page: this.current,
      page_size: this.pageSize,
    };
    if (this.f_name) params.username = this.f_name;
    if (this.f_ip) params.client_ip = this.f_ip;
    if (this.f_status) params.status = this.f_status;
    if (this.f_module) params.module = this.f_module;

    http.get('/api/account/log/operotionlog/', { params })
      .then(res => runInAction(() => {
        this.records = res.results || [];
        this.total = res.total || 0;
      }))
      .finally(() => runInAction(() => this.isFetching = false));
  };

  @action
  setPage = (page, pageSize) => {
    this.current = page;
    this.pageSize = pageSize;
    this.fetchRecords();
  };
}

export default new Store();
