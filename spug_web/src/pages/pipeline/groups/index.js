import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { Button, Modal, Form, Input, InputNumber, Table, message } from 'antd';
import { AuthDiv, AuthButton, Breadcrumb, Action, TableCard } from 'components';
import { http } from 'libs';
import style from './index.module.less';

function PipelineGroups() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [form] = Form.useForm();
  const [editId, setEditId] = useState(null);

  useEffect(() => {
    fetchRecords();
  }, []);

  function fetchRecords() {
    setLoading(true);
    http.get('/api/pipeline/groups/').then(setRecords).finally(() => setLoading(false));
  }

  function handleAdd() {
    setEditId(null);
    form.resetFields();
    form.setFieldsValue({ sort_id: 0 });
    setVisible(true);
  }

  function handleEdit(record) {
    setEditId(record.id);
    form.setFieldsValue({
      name: record.name,
      desc: record.desc,
      sort_id: record.sort_id,
    });
    setVisible(true);
  }

  function handleSave() {
    form.validateFields().then(values => {
      const data = { ...values };
      if (editId) data.id = editId;
      http.post('/api/pipeline/groups/', data).then(() => {
        message.success('保存成功');
        setVisible(false);
        fetchRecords();
      });
    });
  }

  function handleDelete(record) {
    Modal.confirm({
      title: '删除确认',
      content: `确定要删除分组 "${record.name}" 吗？`,
      onOk: () => {
        http.delete('/api/pipeline/groups/', { params: { id: record.id } }).then(() => {
          message.success('删除成功');
          fetchRecords();
        });
      }
    });
  }

  return (
    <AuthDiv auth="pipeline.group.view">
      <Breadcrumb items={['首页', '流水线', '流水线分组']} />
      <div className={style.container}>
        <TableCard
          loading={loading}
          actions={[
            <AuthButton auth="pipeline.group.add" type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建分组</AuthButton>
          ]}
        >
          <Table rowKey="id" dataSource={records} pagination={false}>
            <Table.Column title="分组名称" dataIndex="name" width={200} />
            <Table.Column title="描述" dataIndex="desc" />
            <Table.Column title="排序" dataIndex="sort_id" width={80} />
            <Table.Column title="创建时间" dataIndex="created_at" width={180} />
            <Table.Column title="操作" width={150} render={info => (
              <Action>
                <Action.Button auth="pipeline.group.edit" icon={<EditOutlined />} onClick={() => handleEdit(info)}>编辑</Action.Button>
                <Action.Button danger auth="pipeline.group.del" icon={<DeleteOutlined />} onClick={() => handleDelete(info)}>删除</Action.Button>
              </Action>
            )} />
          </Table>
        </TableCard>
      </div>
      <Modal
        title={editId ? '编辑分组' : '新建分组'}
        open={visible}
        onOk={handleSave}
        onCancel={() => setVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="分组名称" rules={[{ required: true, message: '请输入分组名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="desc" label="描述">
            <Input />
          </Form.Item>
          <Form.Item name="sort_id" label="排序">
            <InputNumber />
          </Form.Item>
        </Form>
      </Modal>
    </AuthDiv>
  );
}

export default observer(PipelineGroups);