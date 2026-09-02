import React, { useState } from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Modal, Form, Input, Switch, Divider } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import HostSelector from 'pages/host/Selector';
import { ACEditor } from 'components';
import { http } from 'libs';
import S from './store';
import styles from './playbook.module.css';

export default observer(function () {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [hostIds, setHostIds] = useState([]);
  const [extraVars, setExtraVars] = useState(
    S.record.extra_vars ? JSON.stringify(S.record.extra_vars, null, 2) : '{}'
  );

  function handleSubmit() {
    if (hostIds.length === 0) {
      message.error('请选择目标主机');
      return;
    }
    let parsedVars = {};
    try {
      parsedVars = JSON.parse(extraVars);
    } catch {
      message.error('额外变量 JSON 格式错误');
      return;
    }
    setLoading(true);
    const formData = {
      playbook_id: S.record.id,
      host_ids: hostIds,
      extra_vars: parsedVars,
      run_tags: form.getFieldValue('run_tags'),
      skip_tags: form.getFieldValue('skip_tags'),
      check_mode: form.getFieldValue('check_mode') || false,
    };
    http.post('/api/playbook/run/', formData)
      .then(token => {
        message.success('执行已提交');
        S.runVisible = false;
        S.switchOutput(token);
      }, () => setLoading(false))
  }

  const info = S.record;
  return (
    <Modal
      visible
      width={700}
      maskClosable={false}
      title={`执行 Playbook: ${info.name}`}
      onCancel={() => S.runVisible = false}
      confirmLoading={loading}
      okText="开始执行"
      okButtonProps={{icon: <ThunderboltOutlined/>}}
      onOk={handleSubmit}>
      <Form form={form} labelCol={{span: 5}} wrapperCol={{span: 17}} initialValues={{check_mode: false}}>
        <Form.Item required label="目标主机">
          <HostSelector type="button" value={hostIds} onChange={ids => setHostIds(ids)}/>
        </Form.Item>
        <Form.Item name="run_tags" label="执行标签" extra="逗号分隔，对应 --tags">
          <Input placeholder="可选，如 install"/>
        </Form.Item>
        <Form.Item name="skip_tags" label="跳过标签" extra="逗号分隔，对应 --skip-tags">
          <Input placeholder="可选"/>
        </Form.Item>
        <Form.Item name="check_mode" label="干跑模式" valuePropName="checked" extra="仅模拟执行，不实际变更">
          <Switch/>
        </Form.Item>
      </Form>
      <Divider style={{margin: '8px 0'}} orientation="left">额外变量</Divider>
      <span className={styles.sectionDesc}>JSON 格式，覆盖 Playbook 默认变量</span>
      <div className={styles.editorWrap}>
        <ACEditor mode="json" value={extraVars} onChange={setExtraVars} height="120px" width="100%"/>
      </div>
    </Modal>
  )
})
