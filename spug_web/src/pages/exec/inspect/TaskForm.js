import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Modal, Form, Input, Select, Radio, Checkbox, Space } from 'antd';
import { ACEditor } from 'components';
import HostSelector from 'pages/host/Selector';
import { http, cleanCommand } from 'libs';
import S from './store';

const NOTIFY_MODES = [
  {label: '钉钉', value: '3'},
  {label: '邮件', value: '4'},
  {label: '企业微信', value: '5'},
  {label: '飞书', value: '7'},
];

export default observer(function () {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState(S.record.command || '');
  const [ruleType, setRuleType] = useState(S.record.rule?.type || 'exit_code');
  const [exitCodes, setExitCodes] = useState(S.record.rule?.exit_codes || [0]);
  const [keywords, setKeywords] = useState(Array.isArray(S.record.rule?.keywords) ? S.record.rule.keywords.join(',') : (S.record.rule?.keywords || ''));
  const [groups, setGroups] = useState([]);
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    http.get('/api/exec/template/').then(res => setTemplates(res.templates || []));
    http.get('/api/alarm/group/').then(res => setGroups(res))
  }, []);

  function handleSubmit() {
    setLoading(true);
    const formData = form.getFieldsValue();
    formData['id'] = S.record.id;
    formData['command'] = cleanCommand(body);
    formData['host_ids'] = S.record.host_ids;
    formData['rule'] = {
      type: ruleType,
      exit_codes: exitCodes,
      keywords: keywords ? (typeof keywords === 'string' ? keywords.split(',').map(k => k.trim()).filter(Boolean) : keywords) : []
    };
    http.post('/api/exec/inspect/task/', formData)
      .then(res => {
        message.success('操作成功');
        S.formVisible = false;
        S.fetchRecords()
      }, () => setLoading(false))
  }

  function handleTemplateChange(tplId) {
    const tpl = templates.find(t => t.id === tplId);
    if (tpl) {
      form.setFieldsValue({interpreter: tpl.interpreter});
      setBody(tpl.body);
      if (tpl.host_ids && tpl.host_ids.length > 0) {
        S.record.host_ids = tpl.host_ids;
      }
    }
  }

  const info = S.record;
  return (
    <Modal
      open
      width={800}
      maskClosable={false}
      title={S.record.id ? '编辑巡检任务' : '新建巡检任务'}
      onCancel={() => S.formVisible = false}
      confirmLoading={loading}
      onOk={handleSubmit}>
      <Form form={form} initialValues={info} labelCol={{span: 6}} wrapperCol={{span: 14}}>
        <Form.Item required name="name" label="任务名称">
          <Input placeholder="请输入任务名称"/>
        </Form.Item>
        <Form.Item required name="template_id" label="巡检模板">
          <Select placeholder="请选择模板（在模板管理中配置）" onChange={handleTemplateChange}>
            {templates.map(item => (
              <Select.Option value={item.id} key={item.id}>{item.name}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item required name="interpreter" label="脚本语言">
          <Radio.Group>
            <Radio.Button value="sh">Shell</Radio.Button>
            <Radio.Button value="python">Python</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item required label="巡检命令" shouldUpdate={(p, c) => p.interpreter !== c.interpreter}>
          {({getFieldValue}) => (
            <ACEditor
              mode={getFieldValue('interpreter')}
              value={body}
              onChange={val => setBody(val)}
              height="200px"/>
          )}
        </Form.Item>
        <Form.Item label="判定规则">
          <Space direction="vertical" style={{width: '100%'}}>
            <Radio.Group value={ruleType} onChange={e => setRuleType(e.target.value)}>
              <Radio value="exit_code">退出码判定</Radio>
              <Radio value="keyword">关键字判定</Radio>
            </Radio.Group>
            {ruleType === 'exit_code' && (
              <Input
                value={exitCodes.join(',')}
                onChange={e => setExitCodes(e.target.value.split(',').map(Number).filter(n => !isNaN(n)))}
                placeholder="正常退出码，逗号分隔，如: 0"/>
            )}
            {ruleType === 'keyword' && (
              <Input
                value={keywords}
                onChange={e => setKeywords(e.target.value)}
                placeholder="告警关键字，逗号分隔，如: WARNING,CRITICAL"/>
            )}
          </Space>
        </Form.Item>
        <Form.Item label="目标主机">
          <HostSelector nullable value={info.host_ids} onChange={ids => info.host_ids = ids}/>
        </Form.Item>
        <Form.Item name="notify_grp" label="通知联系组">
          <Select mode="multiple" placeholder="选择通知联系组（在报警中心配置）" allowClear>
            {groups.map(item => (
              <Select.Option value={item.id} key={item.id}>{item.name}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="notify_mode" label="通知方式">
          <Checkbox.Group options={NOTIFY_MODES}/>
        </Form.Item>
        <Form.Item name="desc" label="描述信息">
          <Input.TextArea placeholder="请输入描述信息"/>
        </Form.Item>
      </Form>
    </Modal>
  )
})
