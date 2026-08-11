import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Modal, Form, Input, Select, Checkbox, Transfer, Space, Tag } from 'antd';
import HostSelector from 'pages/host/Selector';
import { http } from 'libs';
import S from './store';

const NOTIFY_MODES = [
  {label: '钉钉', value: '3'},
  {label: '邮件', value: '4'},
  {label: '企业微信', value: '5'},
  {label: '飞书', value: '7'},
];

const CATEGORY_COLORS = {
  system: 'blue', disk: 'cyan', network: 'purple',
  service: 'green', memory: 'orange', custom: 'default',
};

export default observer(function () {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [items, setItems] = useState([]);
  const [targetKeys, setTargetKeys] = useState((S.record.item_ids || []).map(String));

  useEffect(() => {
    http.get('/api/alarm/group/').then(res => setGroups(res));
    http.get('/api/exec/inspect/item/').then(res => setItems(res.filter(x => x.is_active)));
  }, []);

  function handleSubmit() {
    setLoading(true);
    form.validateFields().then(values => {
      const payload = {
        ...values,
        id: S.record.id,
        item_ids: targetKeys.map(Number),
        host_ids: S.record.host_ids,
      };
      http.post('/api/exec/inspect/task/', payload)
        .then(() => {
          message.success('操作成功');
          S.formVisible = false;
          S.fetchRecords();
        }, () => setLoading(false))
        .finally(() => setLoading(false));
    }).catch(() => setLoading(false));
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
      onOk={handleSubmit}
    >
      <Form form={form} initialValues={info} labelCol={{span: 6}} wrapperCol={{span: 16}}>
        <Form.Item required name="name" label="任务名称">
          <Input placeholder="请输入任务名称"/>
        </Form.Item>
        <Form.Item required label="巡检项" labelCol={{span: 4}} wrapperCol={{span: 20}}>
          <Transfer
            dataSource={items.map(item => ({key: String(item.id), title: item.name, category: item.category}))}
            targetKeys={targetKeys}
            onChange={setTargetKeys}
            showSearch
            filterOption={(input, item) => item.title.toLowerCase().includes(input.toLowerCase())}
            render={item => (
              <Space size={4}>
                <Tag color={CATEGORY_COLORS[item.category] || 'default'} style={{margin: 0, fontSize: 11}}>
                  {item.category}
                </Tag>
                {item.title}
              </Space>
            )}
            listStyle={{width: '100%', height: 280}}
            locale={{itemUnit: '项', itemsUnit: '项', notFoundContent: '列表为空', searchPlaceholder: '搜索巡检项'}}
          />
        </Form.Item>
        <Form.Item label="目标主机">
          <HostSelector nullable value={info.host_ids} onChange={ids => info.host_ids = ids}/>
        </Form.Item>
        <Form.Item name="notify_grp" label="通知联系组">
          <Select mode="multiple" placeholder="选择通知联系组" allowClear>
            {groups.map(item => (
              <Select.Option value={item.id} key={item.id}>{item.name}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="notify_mode" label="通知方式">
          <Checkbox.Group options={NOTIFY_MODES}/>
        </Form.Item>
        <Form.Item name="desc" label="描述信息">
          <Input.TextArea rows={2} placeholder="请输入描述信息"/>
        </Form.Item>
      </Form>
    </Modal>
  )
})
