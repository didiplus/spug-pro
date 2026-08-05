/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Table, Modal, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Action, TableCard, AuthButton } from 'components';
import { http, hasPermission } from 'libs';
import store from './store';
import groupStore from '../group/store';

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

  handleDelete = (text) => {
    Modal.confirm({
      title: '删除确认',
      content: `确定要删除策略【${text['name']}】?`,
      onOk: () => {
        return http.delete('/api/alarm/policy/', {params: {id: text.id}})
          .then(() => {
            message.success('删除成功');
            store.fetchRecords()
          })
      }
    })
  };

  columns = [{
    title: '策略名称',
    dataIndex: 'name',
  }, {
    title: '通道沉默',
    dataIndex: 'silence_window',
    render: value => `${value}分钟`
  }, {
    title: '升级时间',
    dataIndex: 'escalate_after',
    render: value => value ? `${value}分钟` : '-'
  }, {
    title: '升级通知组',
    dataIndex: 'escalate_to',
    render: value => value && value.length ? value.map(id => this.state.groupMap[id]).join(',') : '-'
  }, {
    title: '重复间隔',
    dataIndex: 'repeat_interval',
    render: value => value ? `${value}分钟` : '-'
  }, {
    title: '状态',
    dataIndex: 'is_active',
    render: value => value ? <Tag color="green">启用</Tag> : <Tag color="default">停用</Tag>
  }, {
    title: '描述',
    dataIndex: 'desc',
    ellipsis: true
  }];

  render() {
    return (
      <TableCard
        tKey="ap"
        rowKey="id"
        title="告警策略"
        loading={store.isFetching}
        dataSource={store.dataSource}
        onReload={store.fetchRecords}
        actions={[
          <AuthButton
            auth="alarm.alarm.view"
            type="primary"
            icon={<PlusOutlined/>}
            onClick={() => store.showForm()}>新建</AuthButton>
        ]}
        pagination={{
          showSizeChanger: true,
          showLessItems: true,
          showTotal: total => `共 ${total} 条`,
          pageSizeOptions: ['10', '20', '50', '100']
        }}>
        {[
          ...this.columns.map((col, i) => <Table.Column key={i} {...col}/>),
          hasPermission('alarm.alarm.view') ? (
            <Table.Column key="action" title="操作" render={info => (
              <Action>
                <Action.Button onClick={() => store.showForm(info)}>编辑</Action.Button>
                <Action.Button danger onClick={() => this.handleDelete(info)}>删除</Action.Button>
              </Action>
            )}/>
          ) : null
        ].filter(Boolean)}
      </TableCard>
    )
  }
}

export default ComTable