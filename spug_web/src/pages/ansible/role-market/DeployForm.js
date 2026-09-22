import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { Modal, Form, Input, InputNumber, Select, Switch, Divider, Typography, Space } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { message } from 'libs/message';
import { http } from 'libs';
import { ACEditor } from 'components';
import HostSelector from 'pages/host/Selector';
import store from './store';
import styles from './role-market.module.css';

const { Text } = Typography;

function renderVarControl(schemaItem, form) {
  const { key, type, default: defaultVal } = schemaItem;
  const name = ['variables', key];
  const rules = schemaItem.required ? [{required: true, message: `请输入 ${schemaItem.label || key}`}] : [];

  if (type === 'bool') {
    return (
      <Form.Item key={key} name={name} label={schemaItem.label || key} valuePropName="checked" rules={rules}>
        <Switch defaultChecked={defaultVal}/>
      </Form.Item>
    );
  }
  if (type === 'int' || type === 'float') {
    return (
      <Form.Item key={key} name={name} label={schemaItem.label || key} rules={rules}>
        <InputNumber style={{width: '100%'}} placeholder={`默认: ${defaultVal}`}/>
      </Form.Item>
    );
  }
  if (type === 'json') {
    return (
      <Form.Item key={key} name={name} label={schemaItem.label || key} rules={rules}>
        <JSONInput defaultVal={defaultVal}/>
      </Form.Item>
    );
  }
  return (
    <Form.Item key={key} name={name} label={schemaItem.label || key} rules={rules}>
      <Input placeholder={defaultVal !== undefined && defaultVal !== '' ? `默认: ${defaultVal}` : ''}/>
    </Form.Item>
  );
}

function JSONInput({defaultVal, onChange}) {
  const [text, setText] = useState(defaultVal ? JSON.stringify(defaultVal, null, 2) : '{}');
  return (
    <div className={styles.jsonEditor}>
      <ACEditor mode="json" value={text} onChange={v => {
        setText(v);
        try {
          if (onChange) onChange(JSON.parse(v));
        } catch (e) { /* ignore parse error */ }
      }} height="100px" width="100%"/>
    </div>
  );
}

export default observer(function DeployForm() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [hostIds, setHostIds] = useState([]);
  const record = store.deployRecord;

  useEffect(() => {
    if (!record) return;
    const initialValues = {variables: {}};
    const schema = record.variables_schema || [];
    for (const item of schema) {
      if (item.default !== undefined) {
        initialValues.variables[item.key] = item.default;
      }
    }
    form.setFieldsValue(initialValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit() {
    if (hostIds.length === 0) {
      message.error('请选择目标主机');
      return;
    }
    form.validateFields().then(values => {
      setLoading(true);
      const payload = {
        name: values.name,
        host_ids: hostIds,
        group_id: values.group_id || null,
        variables: values.variables || {},
        check_mode: values.check_mode || false,
      };
      http.post(`/api/ansible/roles/market/${record.id}/deploy/`, payload)
        .then(res => {
          message.success('部署已提交');
          store.deployVisible = false;
          store.switchOutput(res.token);
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    })
  }

  if (!record) return null;
  const schema = record.variables_schema || [];

  return (
    <Modal
      visible
      width={720}
      maskClosable={false}
      title={`部署 Role: ${record.name}`}
      onCancel={() => store.deployVisible = false}
      confirmLoading={loading}
      okText="开始部署"
      okButtonProps={{icon: <ThunderboltOutlined/>}}
      onOk={handleSubmit}>
      <Form form={form} labelCol={{span: 6}} wrapperCol={{span: 16}}>
        <Form.Item name="name" label="部署名称" rules={[{required: true, message: '请输入部署名称'}]}>
          <Input placeholder={`部署 ${record.name}`}/>
        </Form.Item>
        <Form.Item required label="目标主机">
          <HostSelector type="button" value={hostIds} onChange={setHostIds}/>
        </Form.Item>
        <Form.Item name="check_mode" label="干跑模式" valuePropName="checked" extra="仅模拟执行，不实际变更">
          <Switch/>
        </Form.Item>

        {schema.length > 0 && (
          <>
            <Divider style={{margin: '8px 0'}} orientation="left">
              <Space>
                <Text strong>变量配置</Text>
                <Text type="secondary" style={{fontSize: 12, fontWeight: 'normal'}}>
                  从 defaults/main.yml 自动生成（{schema.length} 个变量）
                </Text>
              </Space>
            </Divider>
            {schema.map(item => renderVarControl(item, form))}
          </>
        )}

        {schema.length === 0 && (
          <Divider style={{margin: '8px 0'}} orientation="left">
            <Text type="secondary" style={{fontSize: 12, fontWeight: 'normal'}}>
              该 Role 未定义变量（defaults/main.yml 为空或不存在）
            </Text>
          </Divider>
        )}
      </Form>
    </Modal>
  )
})