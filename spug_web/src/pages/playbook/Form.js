import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Modal, Form, Input, InputNumber, Switch, Button, Divider, Row, Col, Select } from 'antd';
import { ACEditor } from 'components';
import { http } from 'libs';
import S from './store';

export default observer(function () {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState(S.record.content || '');
  const [extraVars, setExtraVars] = useState(
    S.record.extra_vars ? JSON.stringify(S.record.extra_vars, null, 2) : '{}'
  );
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    http.get('/api/ansible/inventory/').then(setGroups);
  }, []);

  function handleSubmit() {
    setLoading(true);
    const formData = form.getFieldsValue();
    formData['id'] = S.record.id;
    formData['content'] = content;
    try {
      formData['extra_vars'] = JSON.parse(extraVars);
    } catch {
      message.error('额外变量 JSON 格式错误');
      setLoading(false);
      return;
    }
    http.post('/api/playbook/', formData)
      .then(() => {
        message.success('操作成功');
        S.formVisible = false;
        S.fetchRecords();
      }, () => setLoading(false))
  }

  function handleValidate() {
    http.post('/api/playbook/validate/', {content})
      .then(res => {
        const roles = res.roles && res.roles.length ? `，引用 Role: ${res.roles.join(', ')}` : '';
        message.success(`校验通过，共 ${res.plays} 个 play${roles}`);
      })
  }

  const info = S.record;
  return (
    <Modal
      visible
      width={1000}
      maskClosable={false}
      title={S.record.id ? '编辑 Playbook' : '新建 Playbook'}
      onCancel={() => S.formVisible = false}
      confirmLoading={loading}
      onOk={handleSubmit}>
      <Form form={form} initialValues={info} labelCol={{span: 5}} wrapperCol={{span: 17}}>
        <Form.Item required name="name" label="名称">
          <Input placeholder="请输入 Playbook 名称"/>
        </Form.Item>
        <Form.Item name="desc" label="描述">
          <Input placeholder="请输入描述信息"/>
        </Form.Item>
        <Form.Item name="group_id" label="关联分组" extra="关联 Inventory 分组，加载组变量和分组结构">
          <Select
            allowClear
            placeholder="不关联"
            options={groups.map(g => ({value: g.id, label: g.name}))}
          />
        </Form.Item>

        <Form.Item name="tags" label="标签" extra="逗号分隔，如 install,config">
          <Input placeholder="可选"/>
        </Form.Item>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="forks" label="并发数" labelCol={{span: 10}} wrapperCol={{span: 14}}>
              <InputNumber min={0} max={100} style={{width: '100%'}} placeholder="0=默认"/>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="timeout" label="超时(秒)" labelCol={{span: 10}} wrapperCol={{span: 14}}>
              <InputNumber min={0} max={3600} style={{width: '100%'}} placeholder="0=不限"/>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="is_active" label="启用" labelCol={{span: 10}} wrapperCol={{span: 14}} valuePropName="checked">
              <Switch/>
            </Form.Item>
          </Col>
        </Row>
      </Form>
      <Divider style={{margin: '12px 0'}} orientation="left">Playbook 内容</Divider>
      <div style={{marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <span style={{fontSize: 13, color: '#8c8c8c'}}>YAML 格式，定义 Ansible Playbook 的执行内容</span>
        <Button size="small" onClick={handleValidate} style={{color: '#2563fc'}}>YAML 语法校验</Button>
      </div>
      <ACEditor mode="yaml" value={content} onChange={setContent} height="280px" width="100%"/>
      <Divider style={{margin: '12px 0'}} orientation="left">额外变量</Divider>
      <span style={{fontSize: 13, color: '#8c8c8c', display: 'block', marginBottom: 8}}>JSON 格式，执行时作为 extra_vars 传入</span>
      <ACEditor mode="json" value={extraVars} onChange={setExtraVars} height="100px" width="100%"/>
    </Modal>
  )
})
