import React from 'react';
import { observer } from 'mobx-react';
import { Input, Modal, Table, Tag, Drawer, Select, Space, Tooltip, Button } from 'antd';
import { PlusOutlined, ThunderboltOutlined, HistoryOutlined, EyeOutlined } from '@ant-design/icons';
import { message } from 'libs/message';
import { http, hasPermission } from 'libs';
import { SearchForm, AuthDiv, Breadcrumb, TableCard, Action, AuthButton } from 'components';
import ComForm from './Form';
import RunForm from './RunForm';
import Output from './Output';
import store from './store';

@observer
class PlaybookIndex extends React.Component {
  componentDidMount() {
    store.fetchRecords();
  }

  handleDelete = (text) => {
    Modal.confirm({
      title: '删除确认',
      content: `确定要删除【${text.name}】?`,
      onOk: () => {
        return http.delete('/api/playbook/', {params: {id: text.id}})
          .then(() => {
            message.success('删除成功');
            store.fetchRecords();
          })
      }
    })
  };

  handleToggle = (text) => {
    http.patch('/api/playbook/', {id: text.id, is_active: !text.is_active})
      .then(() => {
        message.success('操作成功');
        store.fetchRecords();
      })
  };

  renderTags = (tags) => {
    if (!tags) return <Tag style={{margin: 0}}>-</Tag>;
    const list = tags.split(',').filter(Boolean);
    return (
      <Space size={4} wrap>
        {list.map(t => <Tag key={t} color="blue" style={{margin: 0}}>{t.trim()}</Tag>)}
      </Space>
    );
  };

  renderHistoryStatus = (v) => {
    const map = {
      running: {color: 'processing', text: '执行中'},
      success: {color: 'success', text: '成功'},
      failed: {color: 'error', text: '失败'},
      canceled: {color: 'default', text: '已取消'},
    };
    const cfg = map[v] || {color: 'default', text: v};
    return <Tag color={cfg.color} style={{margin: 0}}>{cfg.text}</Tag>;
  };

  render() {
    return (
      <AuthDiv auth="playbook.view|playbook.run">
        <Breadcrumb items={['首页', 'Playbook 管理']}/>
        <SearchForm>
          <SearchForm.Item span={6} title="名称">
            <Input allowClear value={store.f_name} onChange={e => store.f_name = e.target.value} placeholder="请输入"/>
          </SearchForm.Item>
          <SearchForm.Item span={6} title="状态">
            <Select
              allowClear
              value={store.f_status}
              onChange={v => store.f_status = v}
              placeholder="全部"
              options={[
                {value: 'active', label: '启用'},
                {value: 'inactive', label: '停用'},
              ]}/>
          </SearchForm.Item>
        </SearchForm>
        <TableCard
          tKey="pb"
          title="Playbook 列表"
          rowKey="id"
          loading={store.isFetching}
          dataSource={store.dataSource}
          onReload={store.fetchRecords}
          actions={[
            <AuthButton auth="playbook.add" type="primary" icon={<PlusOutlined/>} onClick={() => store.showForm()}>新建</AuthButton>
          ]}
          pagination={{
            showSizeChanger: true,
            showLessItems: true,
            showTotal: total => `共 ${total} 条`,
            pageSizeOptions: ['10', '20', '50'],
          }}>
          <Table.Column
            title="名称"
            dataIndex="name"
            width={200}
            render={(name, record) => (
              <Space direction="vertical" size={0}>
                <span style={{fontWeight: 500}}>{name}</span>
                {record.desc && (
                  <span style={{fontSize: 12, color: '#8c8c8c'}}>{record.desc}</span>
                )}
              </Space>
            )}/>
          <Table.Column title="标签" dataIndex="tags" width={160} render={this.renderTags}/>
          <Table.Column
            title="状态"
            dataIndex="is_active"
            width={80}
            align="center"
            render={v => <Tag color={v ? 'success' : 'default'} style={{margin: 0}}>{v ? '启用' : '停用'}</Tag>}/>
          <Table.Column
            title="创建时间"
            dataIndex="created_at"
            width={170}
            render={v => v || '-'}/>
          <Table.Column
            title="更新时间"
            dataIndex="updated_at"
            width={170}
            render={v => v || '-'}/>
          {hasPermission('playbook.run|playbook.edit|playbook.del') && (
            <Table.Column title="操作" width={200} render={info => (
              <Action>
                <Action.Button auth="playbook.run" icon={<ThunderboltOutlined/>} onClick={() => store.showRun(info)}>执行</Action.Button>
                <Action.Button auth="playbook.view" icon={<HistoryOutlined/>} onClick={() => store.showHistory(info)}>历史</Action.Button>
                <Action.Button auth="playbook.edit" onClick={() => store.showForm(info)}>编辑</Action.Button>
                <Action.Button auth="playbook.edit" onClick={() => this.handleToggle(info)}>{info.is_active ? '停用' : '启用'}</Action.Button>
                <Action.Button danger auth="playbook.del" onClick={() => this.handleDelete(info)}>删除</Action.Button>
              </Action>
            )}/>
          )}
        </TableCard>
        {store.formVisible && <ComForm/>}
        {store.runVisible && <RunForm/>}
        <Drawer
          title="执行历史"
          placement="right"
          width="55%"
          open={store.historyVisible}
          onClose={() => store.historyVisible = false}
          destroyOnClose>
          <Table
            rowKey="id"
            size="small"
            loading={store.historyFetching}
            dataSource={store.histories}
            pagination={{pageSize: 10, showTotal: total => `共 ${total} 条`}}>
            <Table.Column
              title="状态"
              dataIndex="status"
              width={80}
              align="center"
              render={this.renderHistoryStatus}/>
            <Table.Column
              title="耗时"
              dataIndex="duration"
              width={80}
              align="center"
              render={v => <span style={{color: v > 60 ? '#fa8c16' : '#52c41a'}}>{v}s</span>}/>
            <Table.Column title="Token" dataIndex="token" ellipsis width={180}/>
            <Table.Column title="执行时间" dataIndex="created_at" width={170}/>
            <Table.Column
              title="操作"
              width={90}
              align="center"
              render={info => (
                <Tooltip title="查看输出">
                  <Button
                    type="link"
                    size="small"
                    icon={<EyeOutlined/>}
                    onClick={() => {
                      store.historyVisible = false;
                      setTimeout(() => store.switchOutput(info.token), 300);
                    }}/>
                </Tooltip>
              )}/>
          </Table>
        </Drawer>
        <Drawer
          title="执行输出"
          placement="right"
          width="65%"
          open={store.showOutput}
          onClose={store.switchOutput}
          styles={{body: {padding: 0, height: 'calc(100vh - 55px)', overflow: 'hidden'}}}
          destroyOnClose>
          {store.showOutput && <Output/>}
        </Drawer>
      </AuthDiv>
    )
  }
}

export default PlaybookIndex;
