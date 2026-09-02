import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Modal, Form, Input, Select, Button, Table, Typography, Space, Tooltip, Card, Flex, Row, Col, InputNumber, Switch, Divider } from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  ReloadOutlined, ExperimentOutlined, CheckCircleOutlined, StopOutlined,
  CodeOutlined, FilterOutlined,
} from '@ant-design/icons';
import { http, hasPermission } from 'libs';
import { AuthDiv, AuthButton, ACEditor } from 'components';
import styles from './Items.module.css';

const { Text } = Typography;

const CATEGORY_OPTIONS = [
  { value: 'system', label: '系统' },
  { value: 'disk', label: '磁盘' },
  { value: 'network', label: '网络' },
  { value: 'service', label: '服务' },
  { value: 'memory', label: '内存' },
  { value: 'custom', label: '自定义' },
];

const CATEGORY_CLASS = {
  system: styles.catSystem, disk: styles.catDisk, network: styles.catNetwork,
  service: styles.catService, memory: styles.catMemory, custom: styles.catCustom,
};

const MATCH_TYPE_OPTIONS = [
  { value: 'regex_pass', label: '正则匹配 = 通过' },
  { value: 'regex_fail', label: '正则匹配 = 失败' },
];

const THRESHOLD_OP_OPTIONS = [
  { value: 'none', label: '不比较' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '>=' },
  { value: 'lte', label: '<=' },
  { value: 'eq', label: '=' },
];

const EXPECT_STATUS_OPTIONS = [
  { value: 'warning', label: '告警' },
  { value: 'error', label: '失败' },
];

export default observer(function InspectItemManage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [command, setCommand] = useState('');
  const [testVisible, setTestVisible] = useState(false);
  const [testOutput, setTestOutput] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  function fetchItems() {
    setLoading(true);
    http.get('/api/exec/inspect/item/')
      .then(res => setItems(res))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchItems(); }, []);

  function handleAdd() {
    setEditRecord(null);
    form.resetFields();
    form.setFieldsValue({
      category: 'custom', interpreter: 'sh', match_type: 'regex_pass',
      threshold_op: 'none', expect_status: 'warning', is_active: true,
    });
    setCommand('');
    setFormVisible(true);
  }

  function handleEdit(record) {
    setEditRecord(record);
    form.setFieldsValue(record);
    setCommand(record.command || '');
    setFormVisible(true);
  }

  function handleDelete(record) {
    Modal.confirm({
      title: '删除确认',
      content: `确定要删除巡检项【${record.name}】？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => http.delete('/api/exec/inspect/item/', { params: { id: record.id } })
        .then(() => { message.success('删除成功'); fetchItems(); }),
    });
  }

  function handleSubmit() {
    form.validateFields().then(values => {
      setSubmitting(true);
      const payload = { ...values, command };
      const req = editRecord
        ? http.post('/api/exec/inspect/item/', { ...payload, id: editRecord.id })
        : http.post('/api/exec/inspect/item/', payload);
      req.then(() => {
        message.success('操作成功');
        setFormVisible(false);
        fetchItems();
      }).finally(() => setSubmitting(false));
    });
  }

  function handleTest() {
    const values = form.getFieldsValue();
    setTesting(true);
    setTestResult(null);
    http.post('/api/exec/inspect/item/test/', {
      pattern: values.pattern,
      match_type: values.match_type,
      threshold_op: values.threshold_op,
      threshold_val: values.threshold_val,
      expect_status: values.expect_status,
      output: testOutput,
    }).then(res => {
      setTestResult(res);
    }).finally(() => setTesting(false));
  }

  const filteredItems = items.filter(item => {
    if (keyword && !item.name.includes(keyword) && !(item.pattern || '').includes(keyword)) return false;
    if (fCategory && item.category !== fCategory) return false;
    return true;
  });

  const activeCount = items.filter(x => x.is_active).length;
  const categoryCount = Object.keys(items.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {})).length;

  const columns = [
    {
      title: '巡检项名称',
      dataIndex: 'name',
      width: 200,
      render: (text, record) => (
        <Space size={6}>
          <span className={styles.nameCell}>{text}</span>
          {!record.is_active && <span className={styles.inactiveTag}>停用</span>}
        </Space>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      width: 80,
      align: 'center',
      render: (v) => (
        <span className={`${styles.categoryTag} ${CATEGORY_CLASS[v] || styles.catCustom}`}>
          {CATEGORY_OPTIONS.find(o => o.value === v)?.label || v}
        </span>
      ),
    },
    {
      title: '解释器',
      dataIndex: 'interpreter',
      width: 70,
      align: 'center',
      render: (v) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: '正则表达式',
      dataIndex: 'pattern',
      width: 180,
      ellipsis: true,
      render: (v) => v ? <Text code style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: '匹配方式',
      dataIndex: 'match_type',
      width: 130,
      render: (v) => {
        const cfg = MATCH_TYPE_OPTIONS.find(o => o.value === v);
        return (
          <span className={`${styles.matchTag} ${v === 'regex_pass' ? styles.matchPass : styles.matchFail}`}>
            {cfg?.label || v}
          </span>
        );
      },
    },
    {
      title: '阈值',
      width: 100,
      align: 'center',
      render: (_, record) => {
        if (record.threshold_op === 'none' || !record.threshold_op) return <Text type="secondary">-</Text>;
        const op = THRESHOLD_OP_OPTIONS.find(o => o.value === record.threshold_op)?.label || '';
        return <Text code style={{ fontSize: 12 }}>{op} {record.threshold_val}</Text>;
      },
    },
    {
      title: '不通过时',
      dataIndex: 'expect_status',
      width: 80,
      align: 'center',
      render: (v) => (
        <span className={`${styles.matchTag} ${v === 'error' ? styles.expectError : styles.expectWarning}`}>
          {v === 'error' ? '失败' : '告警'}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      align: 'center',
      render: (_, record) => (
        <Space size={0}>
          {hasPermission('exec.inspect.edit') && (
            <Tooltip title="编辑">
              <Button type="link" size="small" icon={<EditOutlined/>} onClick={() => handleEdit(record)}/>
            </Tooltip>
          )}
          {hasPermission('exec.inspect.del') && (
            <Tooltip title="删除">
              <Button type="link" size="small" danger icon={<DeleteOutlined/>} onClick={() => handleDelete(record)}/>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const testStatusClass = testResult?.status === 'success' ? styles.testPass
    : testResult?.status === 'warning' ? styles.testWarning : styles.testFail;
  const testStatusText = testResult?.status === 'success' ? '通过'
    : testResult?.status === 'warning' ? '告警' : '失败';

  return (
    <AuthDiv auth="exec.inspect.view">
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small" className={styles.statCard}>
            <Flex align="center" gap={12}>
              <span className={`${styles.statIcon} ${styles.statIconBlue}`}><ExperimentOutlined/></span>
              <Flex vertical>
                <Text type="secondary" style={{ fontSize: 12 }}>巡检项总数</Text>
                <Text strong style={{ fontSize: 20, color: 'var(--color-primary)' }}>{items.length}</Text>
              </Flex>
            </Flex>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" className={styles.statCard}>
            <Flex align="center" gap={12}>
              <span className={`${styles.statIcon} ${styles.statIconGreen}`}><CheckCircleOutlined/></span>
              <Flex vertical>
                <Text type="secondary" style={{ fontSize: 12 }}>启用</Text>
                <Text strong style={{ fontSize: 20, color: 'var(--color-green-600)' }}>{activeCount}</Text>
              </Flex>
            </Flex>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" className={styles.statCard}>
            <Flex align="center" gap={12}>
              <span className={`${styles.statIcon} ${styles.statIconRed}`}><StopOutlined/></span>
              <Flex vertical>
                <Text type="secondary" style={{ fontSize: 12 }}>停用</Text>
                <Text strong style={{ fontSize: 20, color: 'var(--color-red-600)' }}>{items.length - activeCount}</Text>
              </Flex>
            </Flex>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" className={styles.statCard}>
            <Flex align="center" gap={12}>
              <span className={`${styles.statIcon} ${styles.statIconPurple}`}><FilterOutlined/></span>
              <Flex vertical>
                <Text type="secondary" style={{ fontSize: 12 }}>分类数</Text>
                <Text strong style={{ fontSize: 20, color: 'var(--color-purple-600)' }}>{categoryCount}</Text>
              </Flex>
            </Flex>
          </Card>
        </Col>
      </Row>

      <Card size="small" className={styles.toolbar} styles={{ body: { padding: '10px 16px' } }}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
          <Space size={8}>
            <Input allowClear placeholder="搜索名称或正则" prefix={<SearchOutlined style={{ color: 'var(--color-text-tertiary)' }}/>} style={{ width: 220 }} onChange={e => setKeyword(e.target.value)}/>
            <Select allowClear placeholder="分类筛选" style={{ width: 120 }} options={CATEGORY_OPTIONS} onChange={v => setFCategory(v || '')}/>
            <Button icon={<ReloadOutlined/>} onClick={fetchItems}>刷新</Button>
          </Space>
          {hasPermission('exec.inspect.add') && (
            <AuthButton auth="exec.inspect.add" type="primary" icon={<PlusOutlined/>} onClick={handleAdd}>新建巡检项</AuthButton>
          )}
        </Flex>
      </Card>

      <Table
        columns={columns}
        dataSource={filteredItems}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{
          showSizeChanger: true,
          showLessItems: true,
          hideOnSinglePage: true,
          showTotal: total => `共 ${total} 条`,
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
        className={styles.table}
        scroll={{ x: 920 }}
      />

      <Modal visible={formVisible} width={720} maskClosable={false} title={editRecord ? '编辑巡检项' : '新建巡检项'} onCancel={() => setFormVisible(false)} footer={
        <Space>
          <Button onClick={() => setFormVisible(false)}>取消</Button>
          <Button icon={<ExperimentOutlined/>} onClick={() => { setTestVisible(true); setTestOutput(''); setTestResult(null); }}>测试匹配</Button>
          <Button type="primary" loading={submitting} onClick={handleSubmit}>保存</Button>
        </Space>
      }>
        <Form form={form} labelCol={{ span: 6 }} wrapperCol={{ span: 16 }}>
          <div className={styles.sectionTitle}>基本信息</div>
          <Form.Item name="name" label="巡检项名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：CPU使用率检查"/>
          </Form.Item>
          <Form.Item name="category" label="分类">
            <Select options={CATEGORY_OPTIONS} placeholder="选择分类"/>
          </Form.Item>
          <Form.Item name="interpreter" label="解释器">
            <Select options={[{value: 'sh', label: 'Shell'}, {value: 'python', label: 'Python'}]}/>
          </Form.Item>
          <Form.Item name="desc" label="描述">
            <Input.TextArea rows={2} placeholder="可选"/>
          </Form.Item>

          <Divider style={{ margin: '8px 0' }}/>

          <div className={styles.sectionTitle}>执行命令</div>
          <Form.Item label="命令脚本" required>
            <ACEditor mode={form.getFieldValue('interpreter') || 'sh'} value={command} width="100%" height="120px" onChange={setCommand}/>
          </Form.Item>

          <Divider style={{ margin: '8px 0' }}/>

          <div className={styles.sectionTitle}>匹配规则</div>
          <Form.Item name="match_type" label="匹配方式">
            <Select options={MATCH_TYPE_OPTIONS}/>
          </Form.Item>
          <Form.Item name="pattern" label="正则表达式" rules={[{ required: true, message: '请输入正则' }]}>
            <Input placeholder="如：(\d+\.?\d*)%  捕获组用于阈值比较"/>
          </Form.Item>
          <Form.Item label="阈值比较">
            <Space>
              <Form.Item name="threshold_op" noStyle>
                <Select options={THRESHOLD_OP_OPTIONS} style={{ width: 100 }}/>
              </Form.Item>
              <Form.Item name="threshold_val" noStyle>
                <InputNumber placeholder="阈值" style={{ width: 120 }}/>
              </Form.Item>
            </Space>
          </Form.Item>
          <Form.Item name="expect_status" label="不通过时">
            <Select options={EXPECT_STATUS_OPTIONS}/>
          </Form.Item>
          <Form.Item name="is_active" label="启用状态" valuePropName="checked">
            <Switch/>
          </Form.Item>
        </Form>

        {testVisible && (
          <Modal open width={600} title="测试正则匹配" onCancel={() => setTestVisible(false)} footer={
            <Space>
              <Button onClick={() => setTestVisible(false)}>关闭</Button>
              <Button type="primary" loading={testing} icon={<ExperimentOutlined/>} onClick={handleTest}>执行测试</Button>
            </Space>
          }>
            <Form layout="vertical">
              <Form.Item label="模拟输出">
                <Input.TextArea rows={6} value={testOutput} onChange={e => setTestOutput(e.target.value)} placeholder="粘贴命令执行输出，测试正则匹配"/>
              </Form.Item>
              {testResult && (
                <Form.Item label="测试结果">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <span className={`${styles.testResultTag} ${testStatusClass}`}>{testStatusText}</span>
                    {testResult.matched && <Text>匹配内容: <Text code>{testResult.matched}</Text></Text>}
                    {testResult.actual_value !== null && testResult.actual_value !== undefined && <Text>实际值: <Text code>{testResult.actual_value}</Text></Text>}
                  </Space>
                </Form.Item>
              )}
            </Form>
          </Modal>
        )}
      </Modal>
    </AuthDiv>
  );
});
