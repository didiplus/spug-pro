import React from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Table, Modal, Tag, Tooltip } from 'antd';
import { PlusOutlined, ThunderboltOutlined, FileTextOutlined } from '@ant-design/icons';
import { http, hasPermission } from 'libs';
import { Action, TableCard, AuthButton } from "components";
import store from './store';

const statusMap = {
  success: {color: 'success', text: '正常'},
  warning: {color: 'warning', text: '告警'},
  error: {color: 'error', text: '失败'},
  pending: {color: 'default', text: '待执行'},
  running: {color: 'processing', text: '执行中'},
};

const modeMap = {'3': '钉钉', '4': '邮件', '5': '企微', '7': '飞书'};

@observer
class ComTable extends React.Component {
  componentDidMount() {
    store.fetchRecords()
  }

  handleDelete = (text) => {
    Modal.confirm({
      title: '删除确认',
      content: `确定要删除【${text['name']}】?`,
      onOk: () => {
        return http.delete('/api/exec/inspect/task/', {params: {id: text.id}})
          .then(() => {
            message.success('删除成功');
            store.fetchRecords()
          })
      }
    })
  };

  handleRun = (record) => {
    Modal.confirm({
      title: '执行确认',
      content: `确定要执行巡检任务【${record.name}】?`,
      onOk: () => {
        return http.post('/api/exec/inspect/run/', {task_id: record.id})
          .then(() => {
            message.success('巡检任务已提交执行');
            store.fetchRecords();
            this._pollStatus()
          })
      }
    })
  };

  handleReport = (record) => {
    store.showReport(record);
  };

  _pollStatus = () => {
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      store.fetchRecords();
      const hasRunning = store.records.some(r => r.latest_status === 'running' || r.latest_status === 'pending');
      if (!hasRunning || count >= 30) {
        clearInterval(timer);
      }
    }, 3000);
  };

  render() {
    return (
      <TableCard
        tKey="eit"
        title="巡检任务"
        rowKey="id"
        loading={store.isFetching}
        dataSource={store.dataSource}
        onReload={store.fetchRecords}
        actions={[
          <AuthButton
            auth="exec.inspect.add"
            type="primary"
            icon={<PlusOutlined/>}
            onClick={() => store.showForm()}>新建任务</AuthButton>
        ]}
        pagination={{
          showSizeChanger: true,
          showLessItems: true,
          showTotal: total => `共 ${total} 条`,
          pageSizeOptions: ['10', '20', '50', '100']
        }}>
        <Table.Column title="任务名称" dataIndex="name"/>
        <Table.Column title="巡检项" dataIndex="items" render={v => v ? v.length : 0}/>
        <Table.Column title="目标主机" dataIndex="host_ids" render={v => v ? v.length : 0}/>
        <Table.Column title="最近状态" dataIndex="latest_status" render={v => {
          const s = statusMap[v] || statusMap.pending;
          return <Tag color={s.color}>{s.text}</Tag>;
        }}/>
        <Table.Column title="执行时间" dataIndex="latest_run_at" width={170} render={v => v || '-'}/>
        <Table.Column ellipsis title="描述" dataIndex="desc"/>
        {hasPermission('exec.inspect.do|exec.inspect.edit|exec.inspect.del') && (
          <Table.Column title="操作" width={200} render={info => (
            <Action>
              <Action.Button auth="exec.inspect.do" icon={<ThunderboltOutlined/>} onClick={() => this.handleRun(info)}>执行</Action.Button>
              <Action.Button auth="exec.inspect.view" onClick={() => store.showResult(info)}>结果</Action.Button>
              <Action.Button auth="exec.inspect.view" icon={<FileTextOutlined/>} onClick={() => this.handleReport(info)}>报告</Action.Button>
              <Action.Button auth="exec.inspect.edit" onClick={() => store.showForm(info)}>编辑</Action.Button>
              <Action.Button danger auth="exec.inspect.del" onClick={() => this.handleDelete(info)}>删除</Action.Button>
            </Action>
          )}/>
        )}
      </TableCard>
    )
  }
}

export default ComTable
