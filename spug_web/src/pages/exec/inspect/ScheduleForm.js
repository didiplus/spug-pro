import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { Modal, Form, Input, InputNumber, Switch, Radio, Button, DatePicker, message } from 'antd';
import dayjs from 'dayjs';
import { http } from 'libs';
import store from './store';

export default observer(function () {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const record = store.record;

  useEffect(() => {
    if (record.id) {
      http.get('/api/exec/inspect/schedule/', { params: { task_id: record.id } })
        .then(res => {
          setSchedule(res);
          if (res && res.trigger_args) {
            let args = res.trigger_args;
            if (res.trigger === 'cron') {
              args = typeof args === 'string' ? JSON.parse(args) : args;
              if (args.start) args.start = dayjs(args.start);
              if (args.stop) args.stop = dayjs(args.stop);
            } else if (res.trigger === 'date') {
              args = dayjs(typeof args === 'string' ? args : args);
            }
            form.setFieldsValue({ trigger: res.trigger, trigger_args: args, is_active: res.is_active });
          } else {
            form.setFieldsValue({ trigger: 'cron', trigger_args: { rule: '0 * * * *', start: null, stop: null }, is_active: false });
          }
        })
        .catch(() => {
          form.setFieldsValue({ trigger: 'cron', trigger_args: { rule: '0 * * * *', start: null, stop: null }, is_active: false });
        });
    }
  }, [record.id]);

  function handleSubmit() {
    form.validateFields().then(values => {
      let trigger_args = values.trigger_args;
      if (values.trigger === 'cron') {
        const args = { ...values.trigger_args };
        if (args.start) args.start = dayjs(args.start).format('YYYY-MM-DD HH:mm:ss');
        if (args.stop) args.stop = dayjs(args.stop).format('YYYY-MM-DD HH:mm:ss');
        trigger_args = JSON.stringify(args);
      } else if (values.trigger === 'date') {
        trigger_args = dayjs(values.trigger_args).format('YYYY-MM-DD HH:mm:ss');
      }
      setLoading(true);
      http.post('/api/exec/inspect/schedule/', {
        task_id: record.id,
        trigger: values.trigger,
        trigger_args,
        is_active: values.is_active,
      }).then(() => {
        message.success('定时配置已保存');
        store.scheduleVisible = false;
      }).finally(() => setLoading(false));
    });
  }

  function handleDelete() {
    Modal.confirm({
      title: '删除确认',
      content: '确定要删除此定时配置？',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        return http.delete('/api/exec/inspect/schedule/', { params: { task_id: record.id } })
          .then(() => {
            message.success('定时配置已删除');
            store.scheduleVisible = false;
          });
      },
    });
  }

  return (
    <Modal
      open={store.scheduleVisible}
      title={`定时设置 - ${record.name || ''}`}
      width={520}
      onCancel={() => store.scheduleVisible = false}
      destroyOnClose
      footer={[
        schedule ? <Button key="delete" danger type="text" onClick={handleDelete}>删除定时</Button> : null,
        <Button key="cancel" onClick={() => store.scheduleVisible = false}>取消</Button>,
        <Button key="ok" type="primary" loading={loading} onClick={handleSubmit}>保存</Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="trigger" label="触发器类型" rules={[{ required: true }]}>
          <Radio.Group onChange={e => {
            const v = e.target.value;
            if (v === 'cron') form.setFieldValue('trigger_args', { rule: '0 * * * *', start: null, stop: null });
            else if (v === 'interval') form.setFieldValue('trigger_args', 300);
            else if (v === 'date') form.setFieldValue('trigger_args', null);
          }}>
            <Radio value="cron">Cron 表达式</Radio>
            <Radio value="interval">间隔执行</Radio>
            <Radio value="date">一次性执行</Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item shouldUpdate noStyle>
          {({ getFieldValue }) => {
            const trigger = getFieldValue('trigger');
            if (trigger === 'cron') {
              return (
                <>
                  <Form.Item name={['trigger_args', 'rule']} label="Cron 规则" rules={[{ required: true, message: '请输入 Cron 规则' }]} extra="格式：分 时 日 月 周（如 0 * * * * 每小时执行）">
                    <Input placeholder="0 * * * *" />
                  </Form.Item>
                  <Form.Item name={['trigger_args', 'start']} label="开始时间">
                    <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name={['trigger_args', 'stop']} label="结束时间">
                    <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: '100%' }} />
                  </Form.Item>
                </>
              );
            }
            if (trigger === 'interval') {
              return (
                <Form.Item name="trigger_args" label="间隔秒数" rules={[{ required: true, message: '请输入间隔秒数' }]}>
                  <InputNumber min={1} placeholder="如 300（每5分钟）" style={{ width: '100%' }} />
                </Form.Item>
              );
            }
            if (trigger === 'date') {
              return (
                <Form.Item name="trigger_args" label="执行时间" rules={[{ required: true, message: '请选择执行时间' }]}>
                  <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: '100%' }} />
                </Form.Item>
              );
            }
            return null;
          }}
        </Form.Item>
        <Form.Item name="is_active" label="启用定时" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
});