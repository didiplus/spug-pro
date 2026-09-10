import { observable } from 'mobx';
import { http } from 'libs';

class Store {
  @observable dashboards = [];
  @observable isFetching = false;
  @observable editorVisible = false;
  @observable editingId = null;
  @observable viewVisible = false;
  @observable viewDashboard = null;

  fetchRecords = () => {
    this.isFetching = true;
    http.get('/api/monitor/dashboard/')
      .then(res => this.dashboards = res)
      .finally(() => this.isFetching = false)
  };

  showEditor = (id = null) => {
    this.editingId = id;
    this.editorVisible = true;
  };

  closeEditor = () => {
    this.editorVisible = false;
    this.editingId = null;
  };

  showView = (id) => {
    http.get(`/api/monitor/dashboard/${id}/`)
      .then(res => {
        this.viewDashboard = res;
        this.viewVisible = true;
      })
  };

  closeView = () => {
    this.viewVisible = false;
    this.viewDashboard = null;
  };

  handleDelete = (id, cb) => {
    http.delete(`/api/monitor/dashboard/${id}/`)
      .then(() => {
        cb && cb();
        this.fetchRecords();
      })
  }
}

export default new Store();