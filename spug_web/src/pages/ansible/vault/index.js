import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { Modal, Form, Input, Table, Tag, Typography } from 'antd';
import { PlusOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import { message } from 'libs/message';
import { http, hasPermission } from 'libs';
import { AuthDiv, Breadcrumb, TableCard, Action, AuthButton } from 'components';

const { Text } = Typography;

function VaultIndex() {
  const [records, setRecords] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [decryptVisible, setDecryptVisible] = useState(false);
  const [decryptData, setDecryptData] = useState(null);

  function fetchRecords() {
    setIsFetching(true);
    http.get('/api/ansible/vault/')
      .then(res => setRecords(res))
      .finally(() => setIsFetching(false))
  }

  useEffect(() => { fetchRecords() }, []);

  function handleDelete(id) {
    Modal.confirm({
      title: '删除确认',
      content: '确定要删除该 Vault 密钥？',
      onOk: () => http.delete('/api/ansible/vault/', {params: {id}})
        .then(() => { message.success('删除成功'); fetchRecords() })
    })
  }

  function handleDecrypt(id) {
    http.post('/api/ansible/vault/decrypt/', {id})
      .then(res => { setDecryptData(res); setDecryptVisible(true) })
  }

  return (
    <AuthDiv auth="ansible.vault.view">
      <Breadcrumb items={['首页', 'Ansible', 'Vault 管理']}/>
      <TableCard
        tKey="vault"
        title="Vault 密钥列表"
        rowKey="id"
        loading={isFetching}
        dataSource={records}
        onReload={fetchRecords}
        actions={[
          <AuthButton auth="ansible.vault.edit" type="primary" icon={<PlusOutlined/>} onClick={() => {setEditRecord(null); setFormVisible(true)}}>新建</AuthButton>
        ]}>
        <Table.Column title="名称" dataIndex="name"/>
        <Table.Column title="变量名" dataIndex="key" render={v => <Tag color="blue">{v}</Tag>}/>
        <Table.Column title="Vault ID" dataIndex="vault_id" width={100}/>
        <Table.Column title="描述" dataIndex="desc" ellipsis/>
        <Table.Column title="更新时间" dataIndex="updated_at" width={180} render={v => v || '-'}/>
        {hasPermission('ansible.vault.view|ansible.vault.edit') && (
          <Table.Column title="操作" width={180} render={info => (
            <Action>
              <Action.Button auth="ansible.vault.view" icon={<EyeOutlined/>} onClick={() => handleDecrypt(info.id)}>查看</Action.Button>
              <Action.Button auth="ansible.vault.edit" onClick={() => {setEditRecord(info); setFormVisible(true)}}>编辑</Action.Button>
              <Action.Button danger auth="ansible.vault.edit" icon={<DeleteOutlined/>} onClick={() => handleDelete(info.id)}>删除</Action.Button>
            </Action>
          )}/>
        )}
      </TableCard>
      {formVisible && <VaultForm record={editRecord} onCancel={() => setFormVisible(false)} onOk={() => {setFormVisible(false); fetchRecords()}}/>}
      <Modal
        title="解密查看"
        open={decryptVisible}
        onCancel={() => setDecryptVisible(false)}
        footer={null}>
        {decryptData && (
          <div>
            <p><Text strong>变量名: </Text><Tag color="blue">{decryptData.key}</Tag></p>
            <p><Text strong>明文值: </Text></p>
            <Input.TextArea value={decryptData.value} readOnly autoSize={{minRows: 3}}/>
          </div>
        )}
      </Modal>
    </AuthDiv>
  )
}

function VaultForm({record, onCancel, onOk}) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (record) form.setFieldsValue(record);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit() {
    setLoading(true);
    const formData = form.getFieldsValue();
    formData['id'] = record?.id;
    http.post('/api/ansible/vault/', formData)
      .then(() => { message.success('操作成功'); onCancel(); onOk() }, () => setLoading(false))
  }

  return (
    <Modal
      visible
      width={500}
      maskClosable={false}
      title={record ? '编辑 Vault 密钥' : '新建 Vault 密钥'}
      onCancel={onCancel}
      confirmLoading={loading}
      onOk={handleSubmit}>
      <Form form={form} labelCol={{span: 5}} wrapperCol={{span: 17}}>
        <Form.Item required name="name" label="名称">
          <Input placeholder="请输入名称"/>
        </Form.Item>
        <Form.Item required name="key" label="变量名">
          <Input placeholder="如 db_password"/>
        </Form.Item>
        <Form.Item required name="value" label="明文值">
          <Input.TextArea placeholder="请输入明文值，保存时自动加密" autoSize={{minRows: 3}}/>
        </Form.Item>
        <Form.Item name="vault_id" label="Vault ID">
          <Input placeholder="default"/>
        </Form.Item>
        <Form.Item name="desc" label="描述">
          <Input placeholder="可选"/>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default observer(VaultIndex);