import { observable, computed } from "mobx";
import { http, includes } from 'libs';
import { message } from 'libs/message';

class Store {
  @observable records = [];
  @observable detail = null;
  @observable deployments = [];
  @observable isFetching = false;
  @observable detailFetching = false;
  @observable deploymentsFetching = false;
  @observable addVisible = false;
  @observable deployVisible = false;
  @observable deployRecord = null;
  @observable detailVisible = false;
  @observable deploymentsVisible = false;
  @observable runToken = null;
  @observable showOutput = false;
  @observable installingId = null;
  _pollTimer = null;

  @observable f_name;
  @observable f_category;

  @computed get categories() {
    const set = new Set();
    for (const r of this.records) {
      if (r.categories) {
        r.categories.split(',').filter(Boolean).forEach(c => set.add(c.trim()));
      }
    }
    return Array.from(set);
  }

  @computed get dataSource() {
    let data = this.records;
    if (this.f_name) data = data.filter(x => includes(x.name, this.f_name));
    if (this.f_category) data = data.filter(x => x.categories && includes(x.categories, this.f_category));
    return data;
  }

  fetchRecords = () => {
    this.isFetching = true;
    http.get('/api/ansible/roles/market/')
      .then(res => {
        this.records = res;
        this._checkPolling();
      })
      .catch(() => {})
      .finally(() => this.isFetching = false)
  };

  _checkPolling = () => {
    const hasInstalling = this.records.some(r => r.install_status === 'installing');
    if (hasInstalling && !this._pollTimer) {
      this._pollTimer = setInterval(() => {
        http.get('/api/ansible/roles/market/')
          .then(res => {
            this.records = res;
            const stillInstalling = this.records.some(r => r.install_status === 'installing');
            if (!stillInstalling) {
              clearInterval(this._pollTimer);
              this._pollTimer = null;
            }
          })
          .catch(() => {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
          });
      }, 3000);
    } else if (!hasInstalling && this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  };

  fetchDetail = (id) => {
    this.detailFetching = true;
    http.get(`/api/ansible/roles/market/${id}/`)
      .then(res => {
        this.detail = res;
        this.detailVisible = true;
      })
      .catch(() => {})
      .finally(() => this.detailFetching = false)
  };

  fetchDeployments = () => {
    this.deploymentsFetching = true;
    http.get('/api/ansible/roles/deployments/')
      .then(res => this.deployments = res)
      .catch(() => {})
      .finally(() => this.deploymentsFetching = false)
  };

  installRole = (id) => {
    this.installingId = id;
    http.post(`/api/ansible/roles/market/${id}/install/`)
      .then(() => {
        message.success('安装任务已启动');
        this.fetchRecords();
      })
      .catch(() => {})
      .finally(() => this.installingId = null)
  };

  deleteRole = (id) => {
    http.delete(`/api/ansible/roles/market/${id}/`)
      .then(() => {
        message.success('删除成功');
        this.fetchRecords();
        if (this.detail?.id === id) {
          this.detailVisible = false;
          this.detail = null;
        }
      })
      .catch(() => {})
  };

  showAdd = () => { this.addVisible = true; };

  showDeploy = (record) => {
    this.deployRecord = record;
    this.deployVisible = true;
  };

  showDeployments = () => {
    this.deploymentsVisible = true;
    this.fetchDeployments();
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