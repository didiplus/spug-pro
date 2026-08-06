/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Modal, Form, Input, Select, Switch, Transfer } from 'antd';
import http from 'libs/http';
import store from './store';
import groupStore from '../group/store';

export default observer(function () {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (groupStore.records.length === 0) {
      groupStore.fetchRecords();
    }
  }, []);

  function handleSubmit() {
    setLoading(true);
    const formData = form.getFieldsValue();
    formData['id'] = store.record.id;
    http.post('/api/alarm/policy/', formData)
      .then(() => {
        message.success('操作成功');
        store.formVisible = false;
        store.fetchRecords()
      }, () => setLoading(false))
  }

  return (
    <Modal
      visible
      width={800}
      maskClosable={false}
      title={store.record.id ? '编辑告警策略' : '新建告警策略'}
      onCancel={() => store.formVisible = false}
      confirmLoading={loading}
      onOk={handleSubmit}>
      <Form form={form} initialValues={store.record} labelCol={{span: 6}} wrapperCol={{span: 14}}>
        <Form.Item required name="name" label="策略名称">
          <Input placeholder="请输入策略名称"/>
        </Form.Item>
        <Form.Item name="silence_window" initialValue={store.record.silence_window || 30} label="通道沉默" tooltip="相同的告警信息，沉默期内只发送一次">
          <Select placeholder="请选择">
            <Select.Option value={5}>5分钟</Select.Option>
            <Select.Option value={10}>10分钟</Select.Option>
            <Select.Option value={15}>15分钟</Select.Option>
            <Select.Option value={30}>30分钟</Select.Option>
            <Select.Option value={60}>60分钟</Select.Option>
            <Select.Option value={3 * 60}>3小时</Select.Option>
            <Select.Option value={6 * 60}>6小时</Select.Option>
            <Select.Option value={12 * 60}>12小时</Select.Option>
            <Select.Option value={24 * 60}>24小时</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="escalate_after" initialValue={store.record.escalate_after} label="升级时间" tooltip="告警持续未恢复超过此时间后，升级通知到升级通知组">
          <Select placeholder="不升级" allowClear>
            <Select.Option value={5}>5分钟</Select.Option>
            <Select.Option value={10}>10分钟</Select.Option>
            <Select.Option value={15}>15分钟</Select.Option>
            <Select.Option value={30}>30分钟</Select.Option>
            <Select.Option value={60}>60分钟</Select.Option>
            <Select.Option value={2 * 60}>2小时</Select.Option>
            <Select.Option value={4 * 60}>4小时</Select.Option>
            <Select.Option value={8 * 60}>8小时</Select.Option>
            <Select.Option value={24 * 60}>24小时</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="escalate_to" valuePropName="targetKeys" initialValue={store.record.escalate_to || []} label="升级通知组">
          <Transfer
            rowKey={item => item.id}
            titles={['已有联系组', '已选联系组']}
            listStyle={{width: 199}}
            dataSource={groupStore.records}
            render={item => item.name}/>
        </Form.Item>
        <Form.Item name="repeat_interval" initialValue={store.record.repeat_interval} label="重复通知间隔" tooltip="告警未恢复时，每隔此时间重复发送通知">
          <Select placeholder="不重复" allowClear>
            <Select.Option value={5}>5分钟</Select.Option>
            <Select.Option value={10}>10分钟</Select.Option>
            <Select.Option value={15}>15分钟</Select.Option>
            <Select.Option value={30}>30分钟</Select.Option>
            <Select.Option value={60}>60分钟</Select.Option>
            <Select.Option value={3 * 60}>3小时</Select.Option>
            <Select.Option value={6 * 60}>6小时</Select.Option>
            <Select.Option value={12 * 60}>12小时</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="is_active" valuePropName="checked" initialValue={store.record.is_active !== false} label="启用策略">
          <Switch/>
        </Form.Item>
        <Form.Item name="desc" label="备注信息">
          <Input.TextArea placeholder="请输入备注信息"/>
        </Form.Item>
      </Form>
    </Modal>
  )
})