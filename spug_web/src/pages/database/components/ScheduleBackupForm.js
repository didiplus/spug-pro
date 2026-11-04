import React, { useState, useEffect } from 'react';
import { Form, Select, Input, Button, Space, Modal, Radio, Switch } from 'antd';
import { http } from 'libs';
import { message as msg } from 'libs/message';

const TRIGGER_OPTIONS = [
  { label: '每天', value: 'daily' },
  { label: '每小时', value: 'hourly' },
  { label: '每 N 分钟', value: 'interval' },
  { label: 'Cron 表达式', value: 'cron' },
];

const NOTIFY_MODES = [
  { label: '关闭', value: '0' },
  { label: '钉钉', value: '1' },
  { label: '企业微信', value: '3' },
  { label: '飞书', value: '4' },
  { label: 'Webhook', value: '2' },
  { label: '推送助手', value: '5' },
];

export default function ScheduleBackupForm({ visible, editingTask, onCancel, onSuccess }) {
  const [form] = Form.useForm();
  const [dbInstances, setDbInstances] = useState([]);
  const [dbList, setDbList] = useState([]);
  const [dbListLoading, setDbListLoading] = useState(false);
  const [storageConfigs, setStorageConfigs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [notifyMode, setNotifyMode] = useState('0');
  const [notifyValue, setNotifyValue] = useState('');
  const [immediateActivate, setImmediateActivate] = useState(true);

  const isEdit = !!editingTask;

  useEffect(() => {
    if (visible) {
      loadInstances();
      loadStorageConfigs();
      loadContacts();
      if (editingTask) {
        populateForm(editingTask);
      } else {
        form.resetFields();
        setNotifyMode('0');
        setNotifyValue('');
        setImmediateActivate(true);
      }
    }
  }, [visible, editingTask]);

  function loadInstances() {
    http.get('/api/db/instances/', { params: { page: 1, page_size: 200 } })
      .then(res => setDbInstances(res.results || []));
  }

  function loadStorageConfigs() {
    http.get('/api/setting/storage-configs/')
      .then(res => setStorageConfigs(res || []));
  }

  function loadContacts() {
    http.get('/api/alarm/contact/?only_push=1')
      .then(res => setContacts(res || []));
  }

  function populateForm(task) {
    const config = JSON.parse(task.command || '{}');
    const notify = task.rst_notify || { mode: '0', value: '' };
    setNotifyMode(notify.mode || '0');
    setNotifyValue(notify.value || '');
    form.setFieldsValue({
      name: task.name,
      instance_id: config.instance_id,
      database: config.database || undefined,
      mode: config.mode || 'full',
      storage_config_id: config.storage_config_id || undefined,
      remark: config.remark || task.desc || '',
    });
    handleInstanceChange(config.instance_id);
  }

  function handleInstanceChange(instanceId) {
    form.setFieldValue('database', undefined);
    setDbList([]);
    if (instanceId) {
      setDbListLoading(true);
      http.get(`/api/db/instances/${instanceId}/`)
        .then(res => {
          const rows = res?.live?.databases?.rows || [];
          setDbList(rows.map(r => r.name));
        })
        .catch(() => setDbList([]))
        .finally(() => setDbListLoading(false));
    }
  }

  function handleSubmit() {
    form.validateFields().then(values => {
      setSubmitting(true);
      const config = {
        instance_id: values.instance_id,
        database: values.database || '',
        mode: values.mode || 'full',
        storage_config_id: values.storage_config_id || null,
        remark: values.remark || '',
      };
      let triggerArgs;
      if (values.trigger_type === 'daily') {
        triggerArgs = JSON.stringify({ rule: `${values.daily_hour || 2} ${values.daily_minute || 0} * * *` });
      } else if (values.trigger_type === 'hourly') {
        triggerArgs = JSON.stringify({ rule: `0 * * * *` });
      } else if (values.trigger_type === 'interval') {
        triggerArgs = JSON.stringify({ rule: `${values.interval_minutes || 30}` });
      } else {
        triggerArgs = JSON.stringify({ rule: values.cron_expr || '0 2 * * *' });
      }
      const payload = {
        name: values.name,
        type: '数据库备份',
        interpreter: 'db_backup',
        command: JSON.stringify(config),
        targets: ['local'],
        rst_notify: { mode: notifyMode, value: notifyValue },
        trigger: values.trigger_type === 'interval' ? 'interval' : 'cron',
        trigger_args: triggerArgs,
        desc: values.remark || '',
      };
      if (isEdit) {
        payload.id = editingTask.id;
      }
      http.post('/api/schedule/', payload)
        .then(res => {
          msg.success(isEdit ? '更新成功' : '创建成功');
          if (!isEdit && immediateActivate && res?.id) {
            http.patch('/api/schedule/', { id: res.id, is_active: true })
              .then(() => msg.success('任务已自动激活'));
          }
          if (onSuccess) onSuccess();
        })
        .finally(() => setSubmitting(false));
    });
  }

  return (
    <Modal
      open={visible}
      title={isEdit ? '编辑定时备份任务' : '新建定时备份任务'}
      width={680}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
    >
      <Form form={form} layout="horizontal" labelCol={{ span: 6 }} wrapperCol={{ span: 16 }}>
        <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
          <Input placeholder="如：MySQL 每日全量备份" />
        </Form.Item>
        <Form.Item name="instance_id" label="数据库实例" rules={[{ required: true, message: '请选择数据库实例' }]}>
          <Select
            placeholder="请选择数据库实例"
            showSearch
            optionFilterProp="label"
            onChange={handleInstanceChange}
          >
            {dbInstances.map(item => (
              <Select.Option key={item.id} value={item.id} label={`${item.name} (${item.host}:${item.port})`}>
                {item.name} ({item.host}:{item.port})
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="database" label="备份范围">
          <Select
            placeholder="全部数据库"
            allowClear
            loading={dbListLoading}
            options={[{ label: '全部数据库', value: '' }, ...dbList.map(name => ({ label: name, value: name }))]}
          />
        </Form.Item>
        <Form.Item name="mode" label="备份类型" initialValue="full">
          <Select>
            <Select.Option value="full">全量备份</Select.Option>
            <Select.Option value="incremental">增量备份</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="trigger_type" label="执行频率" initialValue="daily">
          <Radio.Group options={TRIGGER_OPTIONS} optionType="button" buttonStyle="solid" />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.trigger_type !== cur.trigger_type}>
          {({ getFieldValue }) => {
            const triggerType = getFieldValue('trigger_type');
            if (triggerType === 'daily') {
              return (
                <Form.Item label="执行时间" wrapperCol={{ span: 8 }}>
                  <Space>
                    <Form.Item name="daily_hour" noStyle initialValue={2}><Input type="number" min={0} max={23} style={{ width: 60 }} /></Form.Item>
                    <span>时</span>
                    <Form.Item name="daily_minute" noStyle initialValue={0}><Input type="number" min={0} max={59} style={{ width: 60 }} /></Form.Item>
                    <span>分</span>
                  </Space>
                </Form.Item>
              );
            }
            if (triggerType === 'interval') {
              return (
                <Form.Item label="间隔分钟" wrapperCol={{ span: 8 }}>
                  <Form.Item name="interval_minutes" noStyle initialValue={30}><Input type="number" min={1} style={{ width: 80 }} /></Form.Item>
                </Form.Item>
              );
            }
            if (triggerType === 'cron') {
              return (
                <Form.Item name="cron_expr" label="Cron 表达式" rules={[{ required: true, message: '请输入 cron 表达式' }]} initialValue="0 2 * * *">
                  <Input placeholder="如：0 2 * * *" />
                </Form.Item>
              );
            }
            return null;
          }}
        </Form.Item>
        <Form.Item name="storage_config_id" label="远程存储" tooltip="选择后将备份文件上传到远程存储">
          <Select
            placeholder="仅本地存储"
            allowClear
            options={storageConfigs.filter(c => c.enabled).map(c => ({ label: `${c.name} (${c.bucket})`, value: c.id }))}
          />
        </Form.Item>
        <Form.Item label="失败通知">
          <Space.Compact style={{ width: '100%' }}>
            <Select
              style={{ width: '30%' }}
              value={notifyMode}
              onChange={v => { setNotifyMode(v); setNotifyValue(''); }}
            >
              {NOTIFY_MODES.map(item => (
                <Select.Option key={item.value} value={item.value}>{item.label}</Select.Option>
              ))}
            </Select>
            {notifyMode === '5' ? (
              <Select
                mode="multiple"
                style={{ width: '70%' }}
                value={notifyValue ? notifyValue.split(',').map(Number) : []}
                onChange={v => setNotifyValue(v.join(','))}
                placeholder="请选择推送对象"
              >
                {contacts.map(item => (
                  <Select.Option key={item.id} value={item.id}>{item.name}</Select.Option>
                ))}
              </Select>
            ) : (
              <Input
                style={{ width: '70%' }}
                value={notifyValue}
                onChange={e => setNotifyValue(e.target.value)}
                disabled={notifyMode === '0'}
                placeholder={notifyMode === '1' ? 'https://oapi.dingtalk.com/robot/send?access_token=xxx' : '请输入'}
              />
            )}
          </Space.Compact>
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} placeholder="可选，最多200字" maxLength={200} />
        </Form.Item>
        {!isEdit && (
          <Form.Item label="立即启用" tooltip="创建后自动激活任务，无需手动启用">
            <Switch checked={immediateActivate} onChange={setImmediateActivate} />
          </Form.Item>
        )}
        <Form.Item wrapperCol={{ offset: 6, span: 16 }}>
          <Space>
            <Button type="primary" loading={submitting} onClick={handleSubmit}>
              {isEdit ? '更新' : '创建'}
            </Button>
            <Button onClick={onCancel}>取消</Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}