/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import {Table, Modal, Tag, Space, Divider} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { http, hasPermission } from 'libs';
import { Action, TableCard, AuthButton, ACEditor } from "components";
import store from './store';

@observer
class ComTable extends React.Component {
  state = {viewRecord: null};

  componentDidMount() {
    store.fetchRecords()
  }

  handleDelete = (text) => {
    Modal.confirm({
      title: '删除确认',
      content: `确定要删除【${text['name']}】?`,
      onOk: () => {
        return http.delete('/api/exec/template/', {params: {id: text.id}})
          .then(() => {
            message.success('删除成功');
            store.fetchRecords()
          })
      }
    })
  };

  render() {
    const {viewRecord} = this.state;
    return (
      <>
      <TableCard
        tKey="et"
        title="模板列表"
        rowKey="id"
        loading={store.isFetching}
        dataSource={store.dataSource}
        onReload={store.fetchRecords}
        actions={[
          <AuthButton
            auth="exec.template.add"
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
        <Table.Column
          title="模板名称"
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
        <Table.Column
          title="类型"
          dataIndex="type"
          width={100}
          render={v => v ? <Tag color="blue" style={{margin: 0}}>{v}</Tag> : <Tag style={{margin: 0}}>-</Tag>}/>
        <Table.Column
          title="语言"
          dataIndex="interpreter"
          width={80}
          align="center"
          render={v => (
            <Tag color={v === 'python' ? 'geekblue' : 'green'} style={{margin: 0}}>
              {v === 'python' ? 'Python' : 'Shell'}
            </Tag>
          )}/>
        {hasPermission('exec.template.view|exec.template.edit|exec.template.del') && (
          <Table.Column title="操作" width={160} render={info => (
            <Action>
              <Action.Button auth="exec.template.view" icon={<EyeOutlined/>} onClick={() => this.setState({viewRecord: info})}>查看</Action.Button>
              <Action.Button auth="exec.template.edit" icon={<EditOutlined/>} onClick={() => store.showForm(info)}>编辑</Action.Button>
              <Action.Button danger auth="exec.template.del" icon={<DeleteOutlined/>} onClick={() => this.handleDelete(info)}>删除</Action.Button>
            </Action>
          )}/>
        )}
      </TableCard>
      <Modal
        visible={!!viewRecord}
        width={700}
        footer={null}
        title={viewRecord ? `${viewRecord.name} - 模板内容` : ''}
        onCancel={() => this.setState({viewRecord: null})}>
        {viewRecord && (
          <>
            <Space size={16} style={{marginBottom: 12}}>
              <span><Tag color="blue">{viewRecord.type}</Tag></span>
              <span><Tag color={viewRecord.interpreter === 'python' ? 'geekblue' : 'green'}>
                {viewRecord.interpreter === 'python' ? 'Python' : 'Shell'}
              </Tag></span>
              {viewRecord.parameters && viewRecord.parameters.length > 0 && (
                <span style={{fontSize: 13, color: '#8c8c8c'}}>
                  参数化：{viewRecord.parameters.map(p => p.name).join('、')}
                </span>
              )}
            </Space>
            <ACEditor
              mode={viewRecord.interpreter || 'sh'}
              value={viewRecord.body || ''}
              height="400px"
              readOnly
            />
          </>
        )}
      </Modal>
      </>
    )
  }
}

export default ComTable
