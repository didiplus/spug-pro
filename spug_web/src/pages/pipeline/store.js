import { computed, observable } from 'mobx';
import { http, includes, t } from 'libs';
import { message } from 'antd';
import S from './console/store';
import lds from 'lodash';

export const STATUS_COLORS = {0: 'default', 1: 'processing', 2: 'success', 3: 'error', 4: 'warning'};
export const STATUS_TEXTS = {0: '待执行', 1: '执行中', 2: '成功', 3: '失败', 4: '已中断'};

class Store {
  @observable records = [];
  @observable record = {nodes: []};
  @observable nodes = [];
  @observable node = {};
  @observable actionNode = {};
  @observable isFetching = true;
  @observable histories = [];
  @observable historyVisible = false;
  @observable historyFetching = false;
  @observable f_name = '';

  @computed get dataSource() {
    let records = this.records;
    if (this.f_name) records = records.filter(x => includes(x.name, this.f_name));
    return records
  }

  fetchRecords = () => {
    this.isFetching = true;
    return http.get('/api/pipeline/')
      .then(res => this.records = res)
      .finally(() => this.isFetching = false)
  }

  fetchRecord = (id) => {
    this.isFetching = true;
    return http.get('/api/pipeline/', {params: {id}})
      .then(res => this.record = res)
      .finally(() => this.isFetching = false)
  }

  updateRecord = () => {
    return http.post('/api/pipeline/', this.record)
      .then(res => {
        this.record = res
        message.success(t('保存成功'))
      })
  }

  showConsole = (record) => {
    this.record = record
    return http.post('/api/pipeline/do/', {id: record.id})
      .then(res => {
        S.recordD = record
        S.token = res.token
        S.nodes = res.nodes
        S.node = lds.cloneDeep(res.nodes[0])
        S.outputs = res.outputs
        S.readonly = false
        S.wsIndex = 0
      })
  }

  fetchHistories = (id) => {
    this.historyFetching = true;
    return http.get('/api/pipeline/history/', {params: {pipeline_id: id}})
      .then(res => this.histories = res)
      .finally(() => this.historyFetching = false)
  }

  showHistories = (record) => {
    this.record = record
    this.histories = []
    this.historyVisible = true
    this.fetchHistories(record.id)
  }

  showHistoryConsole = (info) => {
    return http.get(`/api/pipeline/history/${info.id}/`)
      .then(res => {
        if (!res.nodes || !res.nodes.length) {
          message.warning(t('该执行记录没有可回放的内容'))
          return
        }
        this.historyVisible = false
        S.recordD = this.record
        S.token = res.token
        S.nodes = res.nodes
        S.node = lds.cloneDeep(res.nodes[0])
        S.outputs = res.outputs
        S.readonly = res.status !== 0
        S.wsIndex = res.index
      })
  }
}

export default new Store()