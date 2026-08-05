/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import { observer } from 'mobx-react';
import { Radio, Tag, Tooltip, Switch, Table } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { TableCard } from 'components';
import store from './store';
import groupStore from '../group/store';
import TrendChart from './TrendChart';

@observer
class ComTable extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      groupMap: {}
    }
  }

  componentDidMount() {
    store.fetchRecords();
    store.fetchTrend();
    if (groupStore.records.length === 0) {
      groupStore.fetchRecords().then(this._handleGroups)
    } else {
      this._handleGroups()
    }
  }

  _handleGroups = () => {
    const tmp = {};
    for (let item of groupStore.records) {
      tmp[item.id] = item.name
    }
    this.setState({groupMap: tmp})
  };

  handleToggleGrouped = (checked) => {
    store.f_grouped = checked;
    store.fetchRecords();
  };

  normalColumns = [{
    title: '任务名称',
    dataIndex: 'name',
  }, {
    title: '监控类型',
    dataIndex: 'type',
  }, {
    title: '监控对象',
    dataIndex: 'target'
  }, {
    title: '状态',
    dataIndex: 'status',
    render: value => value === '1' ? <Tag color="orange">报警发生</Tag> : <Tag color="green">故障恢复</Tag>
  }, {
    title: '持续时间',
    dataIndex: 'duration',
  }, {
    title: '通知方式',
    dataIndex: 'notify_mode',
  }, {
    title: '通知对象',
    dataIndex: 'notify_grp',
    render: value => value ? value.map(id => this.state.groupMap[id]).join(',') : '-'
  }, {
    title: '发生时间',
    dataIndex: 'created_at'
  }];

  groupedColumns = [{
    title: '任务名称',
    dataIndex: 'name',
  }, {
    title: '监控类型',
    dataIndex: 'type',
  }, {
    title: '监控对象',
    dataIndex: 'target'
  }, {
    title: '归并数量',
    dataIndex: 'count',
    render: value => <Tag color="blue">{value}</Tag>
  }, {
    title: '最新状态',
    dataIndex: 'latest_status',
    render: value => value === '1' ? <Tag color="orange">报警发生</Tag> : <Tag color="green">故障恢复</Tag>
  }, {
    title: '是否升级',
    dataIndex: 'is_escalated',
    render: value => value ? <Tag color="red">已升级</Tag> : <Tag color="default">未升级</Tag>
  }, {
    title: '最近时间',
    dataIndex: 'latest_created_at'
  }];

  render() {
    const columns = store.f_grouped ? this.groupedColumns : this.normalColumns;
    return (
      <React.Fragment>
        <TrendChart/>
        <TableCard
          key={store.f_grouped ? 'aa_grouped' : 'aa'}
          tKey={store.f_grouped ? 'aa_grouped' : 'aa'}
          rowKey={store.f_grouped ? 'fingerprint' : 'id'}
          title={(
            <div style={{display: 'flex', alignItems: 'center'}}>
              <div>报警历史记录</div>
              <Tooltip title="每天自动清理，仅保留最近30天的报警记录。">
                <QuestionCircleOutlined style={{color: '#999', marginLeft: 8}}/>
              </Tooltip>
            </div>
          )}
          loading={store.isFetching}
          dataSource={store.dataSource}
          onReload={store.fetchRecords}
          actions={[
            <Radio.Group value={store.f_status} onChange={e => store.f_status = e.target.value}>
              <Radio.Button value="">全部</Radio.Button>
              <Radio.Button value="1">报警发生</Radio.Button>
              <Radio.Button value="2">报警恢复</Radio.Button>
            </Radio.Group>,
            <React.Fragment>
              <span style={{marginRight: 8, fontSize: 13, color: '#666'}}>归并展示</span>
              <Switch checked={store.f_grouped} onChange={this.handleToggleGrouped}/>
            </React.Fragment>
          ]}
          pagination={{
            showSizeChanger: true,
            showLessItems: true,
            showTotal: total => `共 ${total} 条`,
            pageSizeOptions: ['10', '20', '50', '100']
          }}>
          {columns.map((col, i) => (
            <Table.Column key={i} {...col}/>
          ))}
        </TableCard>
      </React.Fragment>
    )
  }
}

export default ComTable
