/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright: (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import {observer} from 'mobx-react';
import { message } from 'libs/message';
import {Form, Radio, Spin, Tag, Typography} from 'antd';
import styles from './index.module.css';
import http from 'libs/http';
import store from './store';

const {Text, Paragraph} = Typography;

export default observer(function () {
  function handleChange(e) {
    const value = e.target.value;
    store.isFetching = true;
    http.post('/api/setting/', {data: [{key: 'exec_engine', value}]})
      .then(() => {
        message.success('设置成功，新的执行任务将使用所选引擎');
        store.fetchSettings()
      }, () => store.isFetching = false)
  }

  const execEngine = store.settings.exec_engine || 'paramiko';
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
      </Form>
    </Spin>
  )
})