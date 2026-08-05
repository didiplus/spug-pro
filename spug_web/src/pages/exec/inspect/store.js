import { observable} from "mobx";
import { http, includes } from 'libs';

class Store {
  @observable records = [];
  @observable record = {};
  @observable isFetching = false;
  @observable formVisible = false;
  @observable resultVisible = false;
  @observable results = [];
  @observable f_name;
  @observable f_status;

  get dataSource() {
    let data = this.records
    if (this.f_name) data = data.filter(x => includes(x.name, this.f_name))
    if (this.f_status) data = data.filter(x => x.latest_status === this.f_status)
    return data
  }

  fetchRecords = () => {
    this.isFetching = true;
    http.get('/api/exec/inspect/task/')
      .then(res => this.records = res)
      .finally(() => this.isFetching = false)
  };

  showForm = (info = {interpreter: 'sh', host_ids: [], rule: {type: 'exit_code', exit_codes: [0]}, notify_grp: [], notify_mode: []}) => {
    this.formVisible = true;
    this.record = info
  };

  showResult = (record) => {
    this.resultVisible = true;
    this.record = record;
    http.get('/api/exec/inspect/result/', {params: {task_id: record.id}})
      .then(res => this.results = res)
  };
}

export default new Store()
