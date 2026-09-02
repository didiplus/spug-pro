import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Modal, Form, Input, Select, Transfer, Tag } from 'antd';
import {
  ProfileOutlined,
  DeploymentUnitOutlined,
  NotificationOutlined,
} from '@ant-design/icons';
import HostSelector from 'pages/host/Selector';
import { http } from 'libs';
import S from './store';
import styles from './TaskForm.module.css';

const NOTIFY_MODES = [
  { label: '钉钉', value: '3' },
  { label: '邮件', value: '4' },
  { label: '企业微信', value: '5' },
  { label: '飞书', value: '7' },
];

const CATEGORY_COLORS = {
  system: 'blue', disk: 'cyan', network: 'purple',
  service: 'green', memory: 'orange', custom: 'default',
};

function SectionTitle({ icon, children }) {
  return (
    <div className={styles.section}>
      <span className={styles.sectionIcon}>{icon}</span>
      {children}
    </div>
  );
}

export default observer(function () {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [items, setItems] = useState([]);
  const [targetKeys, setTargetKeys] = useState((S.record.item_ids || []).map(String));
  const [notifyModes, setNotifyModes] = useState(S.record.notify_mode || []);

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
        notify_mode: notifyModes,
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

  function toggleNotifyMode(value) {
    setNotifyModes(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  }

  const info = S.record;
  const transferData = items.map(item => ({
    key: String(item.id),
    title: item.name,
    category: item.category,
  }));

  return (
    <Modal
      open
      width={820}
      maskClosable={false}
      title={S.record.id ? '编辑巡检任务' : '新建巡检任务'}
      onCancel={() => S.formVisible = false}
      confirmLoading={loading}
      onOk={handleSubmit}
      destroyOnClose
    >
      <Form form={form} initialValues={info} labelCol={{ span: 5 }} wrapperCol={{ span: 18 }}>
        {/* ── 基本信息 ── */}
        <div className={styles.sectionBlock}>
          <SectionTitle icon={<ProfileOutlined />}>基本信息</SectionTitle>
          <Form.Item required name="name" label="任务名称">
            <Input placeholder="请输入任务名称" maxLength={64}/>
          </Form.Item>
          <Form.Item name="desc" label="描述信息">
            <Input.TextArea rows={2} placeholder="请输入描述信息" maxLength={200} showCount/>
          </Form.Item>
        </div>

        {/* ── 巡检配置 ── */}
        <div className={styles.sectionBlock}>
          <SectionTitle icon={<DeploymentUnitOutlined />}>巡检配置</SectionTitle>
          <Form.Item required label="巡检项" labelCol={{ span: 3 }} wrapperCol={{ span: 20 }}>
            <Transfer
              className={styles.transfer}
              dataSource={transferData}
              targetKeys={targetKeys}
              onChange={setTargetKeys}
              showSearch
              filterOption={(input, item) => item.title.toLowerCase().includes(input.toLowerCase())}
              render={item => (
                <div className={styles.transferItem}>
                  <Tag color={CATEGORY_COLORS[item.category] || 'default'} className={styles.transferTag}>
                    {item.category}
                  </Tag>
                  <span>{item.title}</span>
                </div>
              )}
              locale={{ itemUnit: '项', itemsUnit: '项', notFoundContent: '列表为空', searchPlaceholder: '搜索巡检项' }}
            />
          </Form.Item>
          <Form.Item label="目标主机" labelCol={{ span: 3 }} wrapperCol={{ span: 20 }}>
            <div className={styles.hostSelector}>
              <HostSelector nullable value={info.host_ids} onChange={ids => info.host_ids = ids}/>
            </div>
          </Form.Item>
        </div>

        {/* ── 通知配置 ── */}
        <div className={styles.sectionBlock}>
          <SectionTitle icon={<NotificationOutlined />}>通知配置</SectionTitle>
          <Form.Item name="notify_grp" label="通知联系组">
            <Select mode="multiple" placeholder="选择通知联系组" allowClear
              options={groups.map(item => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>
          <Form.Item label="通知方式">
            <div className={styles.notifyModes} role="group" aria-label="通知方式">
              {NOTIFY_MODES.map(mode => (
                <span
                  key={mode.value}
                  className={`${styles.notifyMode} ${notifyModes.includes(mode.value) ? styles.notifyModeActive : ''}`}
                  onClick={() => toggleNotifyMode(mode.value)}
                  role="checkbox"
                  aria-checked={notifyModes.includes(mode.value)}
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleNotifyMode(mode.value); } }}
                >
                  {mode.label}
                </span>
              ))}
            </div>
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
});
