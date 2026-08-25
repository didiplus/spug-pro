import { observable } from 'mobx';
import http from 'libs/http';

class Store {
  @observable user = {};
  @observable fetching = false;

  fetchUser = () => {
    this.fetching = true;
    return http.get('/api/account/self/')
      .then(res => { this.user = res; return res; })
      .finally(() => { this.fetching = false; })
  }
}

export default new Store()
