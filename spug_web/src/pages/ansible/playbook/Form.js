import React, { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Modal, Form, Input, InputNumber, Switch, Button, Row, Col, Select, Space, Tag, Typography, Collapse } from 'antd';
import { CheckCircleOutlined, FileTextOutlined, CodeOutlined, HistoryOutlined, ExclamationCircleOutlined, LoadingOutlined, SettingOutlined } from '@ant-design/icons';
import { ACEditor } from 'components';
import { http } from 'libs';
import S from './store';
import styles from './playbook.module.css';
import VersionHistory from './VersionHistory';

const { Text } = Typography;

const VALIDATION_STATUS = {
  idle: { icon: null, color: null, text: '' },
  validating: { icon: <LoadingOutlined />, color: 'var(--color-text-secondary)', text: '校验中...' },
  valid: { icon: <CheckCircleOutlined />, color: 'var(--color-green-600)', text: 'YAML 语法正确' },
  invalid: { icon: <ExclamationCircleOutlined />, color: 'var(--color-red-600)', text: '语法错误' },
};


export default observer(function () {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [content, setContent] = useState(S.record.content || '');
  const [extraVars, setExtraVars] = useState(
    S.record.extra_vars ? JSON.stringify(S.record.extra_vars, null, 2) : '{}'
  );
  const [groups, setGroups] = useState([]);
  const [versionVisible, setVersionVisible] = useState(false);
  const [rtStatus, setRtStatus] = useState('idle');
  const [rtMessage, setRtMessage] = useState('');
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    http.get('/api/ansible/inventory/').then(setGroups).catch(() => {});
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!content.trim()) {
      setRtStatus('idle');
      setRtMessage('');
      return;
    }
    setRtStatus('validating');
    debounceRef.current = setTimeout(() => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      http.post('/api/ansible/playbooks/validate/', { content }, { signal: controller.signal })
        .then(res => {
          setRtStatus('valid');
          setRtMessage(`${res.plays} 个 play${res.roles?.length ? `，${res.roles.length} 个 Role` : ''}`);
        })
        .catch(err => {
          if (err.name === 'AbortError') return;
          setRtStatus('invalid');
          setRtMessage(err?.message || '校验失败');
        });
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content]);

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
    http.post('/api/ansible/playbooks/', formData)
      .then(() => {
        message.success('操作成功');
        S.formVisible = false;
        S.fetchRecords();
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  function handleValidate() {
    setValidating(true);
    http.post('/api/ansible/playbooks/validate/', {content})
      .then(res => {
        const roles = res.roles && res.roles.length ? `，引用 Role: ${res.roles.join(', ')}` : '';
        message.success(`校验通过，共 ${res.plays} 个 play${roles}`);
      })
      .catch(() => {})
      .finally(() => setValidating(false))
  }

  const info = S.record;
  const isEdit = !!S.record.id;
  return (
    <Modal
      open
      width={960}
      maskClosable={false}
      className={styles.formModal}
      title={
        <Space>
          <span>{isEdit ? '编辑 Playbook' : '新建 Playbook'}</span>
          {isEdit && (
            <Button size="small" icon={<HistoryOutlined/>} onClick={() => setVersionVisible(true)}>版本历史</Button>
          )}
        </Space>
      }
      onCancel={() => S.formVisible = false}
      confirmLoading={loading}
      onOk={handleSubmit}>
      <Form form={form} initialValues={info} labelCol={{span: 5}} wrapperCol={{span: 18}} className={styles.pbForm}>
        <div className={styles.formSection}>
          <div className={styles.formSectionHeader}>
            <FileTextOutlined className={styles.formSectionIcon}/>
            <span>基本信息</span>
          </div>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item required name="name" label="名称">
                <Input placeholder="请输入 Playbook 名称"/>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="desc" label="描述">
                <Input placeholder="请输入描述信息"/>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="group_id" label="关联分组" extra="加载组变量和分组结构">
                <Select
                  allowClear
                  placeholder="不关联"
                  options={groups.map(g => ({value: g.id, label: g.name}))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tags" label="标签" extra="逗号分隔，如 install,config">
                <Input placeholder="可选"/>
              </Form.Item>
            </Col>
          </Row>
        </div>

        <Collapse
          ghost
          defaultActiveKey={['adv']}
          className={styles.advCollapse}
          items={[{
            key: 'adv',
            label: <Space size={4}><SettingOutlined/><span style={{fontSize: 13, fontWeight: 500}}>高级配置</span></Space>,
            children: (
              <Row gutter={16} className={styles.advRow}>
                <Col span={8}>
                  <Form.Item name="forks" label="并发数" labelCol={{span: 8}} wrapperCol={{span: 16}}>
                    <InputNumber min={0} max={100} style={{width: '100%'}} placeholder="0=默认"/>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="timeout" label="超时(秒)" labelCol={{span: 8}} wrapperCol={{span: 16}}>
                    <InputNumber min={0} max={3600} style={{width: '100%'}} placeholder="0=不限"/>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="is_active" label="启用" labelCol={{span: 8}} wrapperCol={{span: 16}} valuePropName="checked">
                    <Switch/>
                  </Form.Item>
                </Col>
              </Row>
            ),
          }]}/>
      </Form>

      <div className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <Space>
            <FileTextOutlined className={styles.formSectionIcon}/>
            <span className={styles.editorSectionTitle}>Playbook 内容</span>
          </Space>
          <Space size="small">
            {rtStatus !== 'idle' && (
              <span className={styles.validateStatus} style={{color: VALIDATION_STATUS[rtStatus].color}}>
                {VALIDATION_STATUS[rtStatus].icon}
                <span style={{marginLeft: 4}}>
                  {VALIDATION_STATUS[rtStatus].text}
                  {rtMessage && rtStatus === 'valid' ? `（${rtMessage}）` : ''}
                </span>
                {rtStatus === 'invalid' && rtMessage && (
                  <Tag color="error" style={{fontSize: 11, margin: '0 0 0 4px'}}>{rtMessage}</Tag>
                )}
              </span>
            )}
            <Button size="small" icon={<CheckCircleOutlined/>} loading={validating} onClick={handleValidate}>完整校验</Button>
          </Space>
        </div>
        <div className={styles.editorWrap}>
          <ACEditor mode="yaml" value={content} onChange={setContent} height="280px" width="100%"/>
        </div>
      </div>

      <div className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <Space>
            <CodeOutlined className={styles.formSectionIcon}/>
            <span className={styles.editorSectionTitle}>额外变量</span>
          </Space>
          <Text type="secondary" style={{fontSize: 12}}>JSON 格式，执行时作为 extra_vars 传入</Text>
        </div>
        <div className={styles.editorWrap}>
          <ACEditor mode="json" value={extraVars} onChange={setExtraVars} height="100px" width="100%"/>
        </div>
      </div>

      {versionVisible && (
        <VersionHistory
          playbookId={S.record.id}
          onClose={() => setVersionVisible(false)}
          onRollback={() => {
            setVersionVisible(false);
            S.formVisible = false;
            S.fetchRecords();
          }}
        />
      )}
    </Modal>
  )
})