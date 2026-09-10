import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Switch, Button, Select, Space, Divider, Card, Row, Col, Popconfirm, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { message } from 'libs/message';
import { http } from 'libs';
import store from './store';

const { Text } = Typography;

const PANEL_TYPES = [
  {value: 'timeseries', label: '时间序列'},
  {value: 'stat', label: '单值统计'},
  {value: 'gauge', label: '仪表盘'},
  {value: 'table', label: '表格'},
  {value: 'bar', label: '柱状图'},
];

export default function Editor() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [panels, setPanels] = useState([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (store.editingId) {
      setFetching(true);
      http.get(`/api/monitor/dashboard/${store.editingId}/`)
        .then(res => {
          form.setFieldsValue({
            name: res.name, desc: res.desc, refresh: res.refresh,
            datasource_url: res.datasource_url, is_active: res.is_active,
          });
          setPanels(res.panels || []);
        })
        .finally(() => setFetching(false));
    }
  }, []);

  function addPanel() {
    setPanels([...panels, {
      title: `面板 ${panels.length + 1}`,
      panel_type: 'timeseries',
      query: '',
      unit: '',
      col_span: 12,
      height: 300,
      config: {},
    }]);
  }

  function updatePanel(index, key, value) {
    const next = [...panels];
    next[index] = {...next[index], [key]: value};
    setPanels(next);
  }

  function removePanel(index) {
    setPanels(panels.filter((_, i) => i !== index));
  }

  function movePanel(index, dir) {
    const next = [...panels];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPanels(next);
  }

  function handleSubmit() {
    form.validateFields().then(values => {
      if (panels.length === 0) {
        message.warning('请至少添加一个面板');
        return;
      }
      setLoading(true);
      const data = {...values, panels, id: store.editingId};
      http.post('/api/monitor/dashboard/', data)
        .then(() => {
          message.success('保存成功');
          store.closeEditor();
          store.fetchRecords();
        }, () => setLoading(false))
    })
  }

  return (
    <Modal
      visible
      width={800}
      maskClosable={false}
      title={store.editingId ? '编辑大盘' : '新建大盘'}
      onCancel={store.closeEditor}
      confirmLoading={loading}
      onOk={handleSubmit}
      okText="保存">
      <Form form={form} labelCol={{span: 5}} wrapperCol={{span: 17}} initialValues={{refresh: 30, is_active: true}}>
        <Form.Item required name="name" label="大盘名称">
          <Input placeholder="如：主机监控概览"/>
        </Form.Item>
        <Form.Item name="desc" label="描述">
          <Input placeholder="可选"/>
        </Form.Item>
        <Form.Item required name="datasource_url" label="数据源地址">
          <Input placeholder="如：http://prometheus:9090"/>
        </Form.Item>
        <Form.Item name="refresh" label="刷新间隔" extra="秒">
          <InputNumber min={5} max={3600}/>
        </Form.Item>
        <Form.Item name="is_active" label="启用" valuePropName="checked">
          <Switch/>
        </Form.Item>
      </Form>

      <Divider style={{margin: '12px 0'}}>面板配置</Divider>

      <Button type="dashed" block icon={<PlusOutlined/>} onClick={addPanel} style={{marginBottom: 12}}>
        添加面板
      </Button>

      {panels.map((p, i) => (
        <Card key={i} size="small" title={p.title || `面板 ${i+1}`} style={{marginBottom: 12}}
          extra={
            <Space size={4}>
              <Button size="small" type="text" icon={<ArrowUpOutlined/>} disabled={i === 0} onClick={() => movePanel(i, -1)}/>
              <Button size="small" type="text" icon={<ArrowDownOutlined/>} disabled={i === panels.length - 1} onClick={() => movePanel(i, 1)}/>
              <Popconfirm title="确定删除？" onConfirm={() => removePanel(i)}>
                <Button size="small" type="text" danger icon={<DeleteOutlined/>}/>
              </Popconfirm>
            </Space>
          }>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="标题" labelCol={{span: 8}} wrapperCol={{span: 16}}>
                <Input value={p.title} onChange={e => updatePanel(i, 'title', e.target.value)}/>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="类型" labelCol={{span: 8}} wrapperCol={{span: 16}}>
                <Select value={p.panel_type} options={PANEL_TYPES} onChange={v => updatePanel(i, 'panel_type', v)}/>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="PromQL" labelCol={{span: 4}} wrapperCol={{span: 20}}>
                <Input.TextArea value={p.query} rows={2} placeholder="如：100 - (avg by (instance) (rate(node_cpu_seconds_total{mode='idle'}[5m])) * 100)"
                  onChange={e => updatePanel(i, 'query', e.target.value)}/>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="单位" labelCol={{span: 8}} wrapperCol={{span: 16}}>
                <Input value={p.unit || ''} placeholder="如：%" onChange={e => updatePanel(i, 'unit', e.target.value)}/>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="列宽" labelCol={{span: 8}} wrapperCol={{span: 16}}>
                <InputNumber value={p.col_span} min={1} max={24} onChange={v => updatePanel(i, 'col_span', v)}/>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="高度" labelCol={{span: 8}} wrapperCol={{span: 16}}>
                <InputNumber value={p.height} min={100} max={800} step={50} onChange={v => updatePanel(i, 'height', v)}/>
              </Form.Item>
            </Col>
          </Row>
        </Card>
      ))}
    </Modal>
  );
}