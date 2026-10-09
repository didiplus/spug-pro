import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { PlusOutlined, DeleteOutlined, EditOutlined, CopyOutlined } from '@ant-design/icons';
import { Button, Modal, Form, Input, Card, Tag, message, List } from 'antd';
import { AuthDiv, AuthButton, Breadcrumb, Action } from 'components';
import { http, history, hasPermission } from '../../../libs';
import style from './index.module.less';

const { TextArea } = Input;

function PipelineTemplates() {
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
    http.get('/api/pipeline/templates/').then(setRecords).finally(() => setLoading(false));
  }

  function handleAdd() {
    setEditId(null);
    form.resetFields();
    form.setFieldsValue({ category: 'general', definition: { stages: [] }, variables: [] });
    setVisible(true);
  }

  function handleEdit(record) {
    setEditId(record.id);
    form.setFieldsValue({
      name: record.name,
      desc: record.desc,
      category: record.category,
    });
    setVisible(true);
  }

  function handleSave() {
    form.validateFields().then(values => {
      const data = { ...values, definition: { stages: [] }, variables: [] };
      if (editId) data.id = editId;
      http.post('/api/pipeline/templates/', data).then(() => {
        message.success('保存成功');
        setVisible(false);
        fetchRecords();
      });
    });
  }

  function handleDelete(record) {
    Modal.confirm({
      title: '删除确认',
      content: `确定要删除模板 "${record.name}" 吗？`,
      onOk: () => {
        http.delete('/api/pipeline/templates/', { params: { id: record.id } }).then(() => {
          message.success('删除成功');
          fetchRecords();
        });
      }
    });
  }

  function handleUse(record) {
    http.post('/api/pipeline/pipelines/', {
      name: `${record.name}_流水线`,
      desc: record.desc,
      definition: record.definition,
      variables: record.variables,
    }).then(res => {
      message.success('已从模板创建流水线');
      history.push('/pipeline/list');
    });
  }

  return (
    <AuthDiv auth="pipeline.template.view">
      <Breadcrumb items={['首页', '流水线', '模板库']} />
      <div className={style.container}>
        <Card
          loading={loading}
          actions={hasPermission('pipeline.template.add') ? [
            <AuthButton auth="pipeline.template.add" type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建模板</AuthButton>
          ] : undefined}
        >
          <List
            grid={{ gutter: 16, column: 3 }}
            dataSource={records}
            renderItem={item => (
              <List.Item>
                <Card
                  size="small"
                  title={item.name}
                  extra={<Tag>{item.category}</Tag>}
                  actions={[
                    <Action key="use">
                      <Action.Button icon={<CopyOutlined />} onClick={() => handleUse(item)}>使用</Action.Button>
                      <Action.Button auth="pipeline.template.edit" icon={<EditOutlined />} onClick={() => handleEdit(item)}>编辑</Action.Button>
                      <Action.Button danger auth="pipeline.template.del" icon={<DeleteOutlined />} onClick={() => handleDelete(item)}>删除</Action.Button>
                    </Action>
                  ]}
                >
                  <div style={{ minHeight: 40 }}>{item.desc || '暂无描述'}</div>
                </Card>
              </List.Item>
            )}
          />
        </Card>
      </div>
      <Modal
        title={editId ? '编辑模板' : '新建模板'}
        open={visible}
        onOk={handleSave}
        onCancel={() => setVisible(false)}
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="desc" label="描述">
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item name="category" label="分类">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </AuthDiv>
  );
}

export default observer(PipelineTemplates);