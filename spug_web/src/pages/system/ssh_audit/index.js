import React from 'react';
import { observer } from 'mobx-react';
import { Input, Select, Modal, Tag, Typography } from 'antd';
import { PlayCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { message } from 'libs/message';
import { SearchForm, AuthDiv, Breadcrumb, TableCard, Action } from 'components';
import store from './store';
import Replay from './Replay';

const { Text } = Typography;

const STATUS_MAP = {
  active: { color: 'processing', text: '活跃' },
  closed: { color: 'success', text: '已关闭' },
  abnormal: { color: 'error', text: '异常断开' },
};

@observer
class SSHAuditIndex extends React.Component {
  componentDidMount() {
    store.fetchRecords();
  }

  handleDelete = (record) => {
    Modal.confirm({
      title: '删除确认',
      content: `确定要删除该会话记录？录制文件将一并删除。`,
      onOk: () => store.handleDelete(record.id, () => message.success('删除成功'))
    })
  };

  renderDuration = (v) => {
    if (!v) return '-';
    if (v < 60) return `${v}s`;
    return `${Math.floor(v / 60)}m${v % 60}s`;
  };

  renderFileSize = (v) => {
    if (!v) return '-';
    if (v < 1024) return `${v} B`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
    return `${(v / 1024 / 1024).toFixed(2)} MB`;
  };

  columns = [
    {title: '主机名称', width: 150, dataIndex: 'host_name', ellipsis: true},
    {title: '主机地址', width: 140, dataIndex: 'host_hostname', ellipsis: true,
      render: v => <Text code style={{fontSize: 12}}>{v}</Text>},
    {title: '用户', width: 100, dataIndex: 'user_name'},
    {title: '客户端IP', width: 130, dataIndex: 'client_ip',
      render: v => v || <Text type="secondary">-</Text>},
    {title: '状态', width: 90, align: 'center', dataIndex: 'status',
      render: v => {
        const cfg = STATUS_MAP[v] || {color: 'default', text: v};
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      }},
    {title: '开始时间', width: 170, dataIndex: 'start_time'},
    {title: '耗时', width: 80, align: 'center', dataIndex: 'duration',
      render: this.renderDuration},
    {title: '文件大小', width: 90, align: 'center', dataIndex: 'file_size',
      render: this.renderFileSize},
    {title: '操作', width: 120, align: 'center', render: record => (
      <Action>
        <Action.Button
          icon={<PlayCircleOutlined/>}
          disabled={record.status === 'active' || !record.file_size}
          onClick={() => store.showReplay(record.token)}>回放</Action.Button>
        <Action.Button danger icon={<DeleteOutlined/>} onClick={() => this.handleDelete(record)}>删除</Action.Button>
      </Action>
    )},
  ];

  render() {
    return (
      <AuthDiv auth="host.console.view">
        <Breadcrumb items={['首页', '系统管理', 'SSH 会话审计']}/>
        <SearchForm>
          <SearchForm.Item span={6} title="主机名称">
            <Input allowClear value={store.f_host_name} onChange={e => store.f_host_name = e.target.value} placeholder="请输入"/>
          </SearchForm.Item>
          <SearchForm.Item span={6} title="状态">
            <Select
              allowClear
              value={store.f_status}
              onChange={v => store.f_status = v}
              placeholder="全部"
              options={[
                {value: 'active', label: '活跃'},
                {value: 'closed', label: '已关闭'},
                {value: 'abnormal', label: '异常断开'},
              ]}/>
          </SearchForm.Item>
        </SearchForm>
        <TableCard
          tKey="ssh_audit"
          rowKey="id"
          title="SSH 会话记录"
          loading={store.isFetching}
          dataSource={store.records}
          onReload={store.fetchRecords}
          pagination={{
            current: store.page,
            pageSize: store.size,
            total: store.total,
            showSizeChanger: true,
            showTotal: total => `共 ${total} 条`,
            pageSizeOptions: ['10', '20', '50'],
            onChange: (page, size) => {
              store.page = page;
              store.size = size;
              store.fetchRecords();
            },
          }}
          columns={this.columns}/>
        {store.replayVisible && <Replay/>}
      </AuthDiv>
    )
  }
}

export default SSHAuditIndex;