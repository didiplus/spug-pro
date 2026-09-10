import { observable } from 'mobx';
import { http } from 'libs';

class Store {
  @observable records = [];
  @observable total = 0;
  @observable isFetching = false;
  @observable replayVisible = false;
  @observable replayToken = null;

  @observable f_host_name;
  @observable f_status;
  @observable page = 1;
  @observable size = 20;

  fetchRecords = () => {
    this.isFetching = true;
    const params = {page: this.page, size: this.size};
    if (this.f_host_name) params.host_name = this.f_host_name;
    if (this.f_status) params.status = this.f_status;
    http.get('/api/host/ssh/sessions/', {params})
      .then(res => {
        this.records = res.data;
        this.total = res.total;
      })
      .finally(() => this.isFetching = false)
  };

  showReplay = (token) => {
    this.replayToken = token;
    this.replayVisible = true;
  };

  closeReplay = () => {
    this.replayVisible = false;
    this.replayToken = null;
  };

  handleDelete = (id, cb) => {
    http.delete('/api/host/ssh/sessions/', {params: {id}})
      .then(() => {
        cb && cb();
        this.fetchRecords();
      })
  }
}

export default new Store();