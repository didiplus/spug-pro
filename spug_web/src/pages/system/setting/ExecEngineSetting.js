/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright: (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, {useState, useEffect} from 'react';
import {observer} from 'mobx-react';
import { message } from 'libs/message';
import {Button, Divider, Form, Input, InputNumber, Radio, Select, Spin, Switch, Tag, Typography} from 'antd';
import styles from './index.module.css';
import http from 'libs/http';
import store from './store';

const {Text, Paragraph} = Typography;

export default observer(function () {
  const [ansibleConfig, setAnsibleConfig] = useState({});
  const [saving, setSaving] = useState(false);

  const execEngine = store.settings.exec_engine || 'paramiko';

  useEffect(() => {
    if (execEngine === 'ansible') {
      setAnsibleConfig({
        ansible_forks: store.settings.ansible_forks ?? 20,
        ansible_strategy: store.settings.ansible_strategy || 'linear',
        ansible_gather_facts: store.settings.ansible_gather_facts ?? false,
        ansible_fact_caching: store.settings.ansible_fact_caching ?? true,
        ansible_vault_password: '',
        ansible_role_dir: store.settings.ansible_role_dir || '/data/roles',
        ansible_module_timeout: store.settings.ansible_module_timeout ?? 300,
        ansible_callback_whitelist: store.settings.ansible_callback_whitelist || '',
      });
    }
  }, [execEngine]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(e) {
    const value = e.target.value;
    store.isFetching = true;
    http.post('/api/setting/', {data: [{key: 'exec_engine', value}]})
      .then(() => {
        message.success('设置成功，新的执行任务将使用所选引擎');
        store.fetchSettings()
      }, () => store.isFetching = false)
  }

  function handleAnsibleConfigChange(key, value) {
    setAnsibleConfig(prev => ({...prev, [key]: value}));
  }

  function saveAnsibleConfig() {
    setSaving(true);
    const data = Object.entries(ansibleConfig)
      .filter(([key]) => key !== 'ansible_vault_password' || ansibleConfig.ansible_vault_password)
      .map(([key, value]) => ({key, value}));
    http.post('/api/setting/', {data})
      .then(() => {
        message.success('Ansible 配置保存成功');
        store.fetchSettings();
        setAnsibleConfig(prev => ({...prev, ansible_vault_password: ''}));
      })
      .finally(() => setSaving(false))
  }

  return (
    <Spin spinning={store.isFetching}>
      <div className={styles.title}>执行引擎设置</div>
      <Form layout="vertical" style={{maxWidth: 600}}>
        <Form.Item
          label="执行引擎"
          extra={
            <Paragraph type="secondary" style={{marginTop: 8, marginBottom: 0}}>
              选择批量执行和巡检任务使用的底层执行引擎。
              切换后正在执行的任务不受影响，新任务将使用所选引擎。
              <br/>
              <Text type="warning">注意：</Text>
              切换到 Ansible 引擎前需确保服务器已安装
              <Text code>ansible-runner</Text>
              依赖，否则将自动回退到 Paramiko。
            </Paragraph>
          }>
          <Radio.Group onChange={handleChange} value={execEngine}>
            <Radio.Button value="paramiko">
              <Tag color="green" style={{marginRight: 4}}>默认</Tag>
              Paramiko
            </Radio.Button>
            <Radio.Button value="ansible">
              <Tag color="blue" style={{marginRight: 4}}>推荐</Tag>
              Ansible
            </Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item label="引擎说明">
          <Paragraph>
            <Text strong>Paramiko</Text>：基于 SSH 直连，单主机单连接，实时输出，适合小规模场景。
            <br/>
            <Text strong>Ansible</Text>：基于 ansible-runner，支持 Inventory、并发控制、模块化操作，
            适合大规模批量执行和自动化运维场景。
          </Paragraph>
        </Form.Item>

        {execEngine === 'ansible' && (
          <>
            <Divider orientation="left">Ansible 引擎配置</Divider>
            <Form.Item
              label="默认并发数 (forks)"
              extra="控制 Ansible 同时连接的主机数量，0 表示使用全局默认值">
              <InputNumber
                min={1}
                max={200}
                value={ansibleConfig.ansible_forks}
                onChange={v => handleAnsibleConfigChange('ansible_forks', v ?? 20)}
                style={{width: '100%'}}
              />
            </Form.Item>
            <Form.Item
              label="执行策略"
              extra="linear: 按任务顺序逐批执行；free: 主机各自尽快执行">
              <Select
                value={ansibleConfig.ansible_strategy}
                onChange={v => handleAnsibleConfigChange('ansible_strategy', v)}
                options={[
                  {value: 'linear', label: 'linear（顺序执行）'},
                  {value: 'free', label: 'free（自由执行）'},
                ]}
              />
            </Form.Item>
            <Form.Item
              label="默认采集 Facts"
              extra="开启后执行 Playbook 时自动采集主机 Facts 信息">
              <Switch
                checked={ansibleConfig.ansible_gather_facts}
                onChange={v => handleAnsibleConfigChange('ansible_gather_facts', v)}
              />
            </Form.Item>
            <Form.Item
              label="启用 Facts 缓存"
              extra="将采集的 Facts 缓存到数据库，避免重复采集">
              <Switch
                checked={ansibleConfig.ansible_fact_caching}
                onChange={v => handleAnsibleConfigChange('ansible_fact_caching', v)}
              />
            </Form.Item>
            <Form.Item
              label="Vault 密码"
              extra="全局 Vault 加密密码，用于加密/解密敏感变量。留空表示不修改">
              <Input.Password
                placeholder="输入新密码或留空保持不变"
                value={ansibleConfig.ansible_vault_password}
                onChange={e => handleAnsibleConfigChange('ansible_vault_password', e.target.value)}
              />
            </Form.Item>
            <Form.Item
              label="Role 存储目录"
              extra="Ansible Role 的本地存储路径">
              <Input
                value={ansibleConfig.ansible_role_dir}
                onChange={e => handleAnsibleConfigChange('ansible_role_dir', e.target.value)}
                placeholder="/data/roles"
              />
            </Form.Item>
            <Form.Item
              label="模块执行超时 (秒)"
              extra="单个 Ansible 模块执行的超时时间">
              <InputNumber
                min={10}
                max={7200}
                value={ansibleConfig.ansible_module_timeout}
                onChange={v => handleAnsibleConfigChange('ansible_module_timeout', v ?? 300)}
                style={{width: '100%'}}
              />
            </Form.Item>
            <Form.Item
              label="Callback 白名单"
              extra="自定义 Ansible Callback 插件列表，逗号分隔">
              <Input
                value={ansibleConfig.ansible_callback_whitelist}
                onChange={e => handleAnsibleConfigChange('ansible_callback_whitelist', e.target.value)}
                placeholder="profile_tasks, timer"
              />
            </Form.Item>
            <Form.Item>
              <Button type="primary" loading={saving} onClick={saveAnsibleConfig}>
                保存 Ansible 配置
              </Button>
            </Form.Item>
          </>
        )}
      </Form>
    </Spin>
  )
})
