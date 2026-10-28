/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useState } from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import {Button, Form, Input, Space, Typography} from 'antd';
import styles from './index.module.css';
import { http } from 'libs';
import store from './store';

export default observer(function () {
  const [form] = Form.useForm();
  const setting = store.settings.mail_service || {};
  const [loading, setLoading] = useState(false);

  function handleEmailTest() {
    form.validateFields().then(formData => {
      setLoading(true);
      http.post('/api/setting/email_test/', formData)
        .then(() => {
          message.success('邮件服务连接成功')
        }).finally(() => setLoading(false))
    })
  }

  function _doSubmit(formData) {
    store.loading = true;
    http.post('/api/setting/', {data: formData})
      .then(() => {
        message.success('保存成功');
        store.fetchSettings()
      })
      .finally(() => store.loading = false)
  }

  function handleSubmit() {
    form.validateFields().then(formData => {
      _doSubmit([{key: 'mail_service', value: formData}])
    })
  }

  return (
    <React.Fragment>
      <div className={styles.title}>报警服务设置</div>
      <div style={{maxWidth: 480}}>
        <Typography.Text type="secondary" style={{display: 'block', marginBottom: 16}}>用于通过邮件方式发送报警信息</Typography.Text>
        <Form form={form} initialValues={setting} labelCol={{span: 6}} wrapperCol={{span: 18}}>
          <Form.Item name="server" label="邮件服务器" rules={[{required: true, message: '请输入邮件服务器'}]}>
            <Input placeholder="例如：smtp.exmail.qq.com"/>
          </Form.Item>
          <Form.Item name="port" label="端口" rules={[{required: true, message: '请输入端口'}]}>
            <Input placeholder="例如：465"/>
          </Form.Item>
          <Form.Item name="username" label="邮箱账号" rules={[{required: true, message: '请输入邮箱账号'}]}>
            <Input placeholder="例如：dev@exmail.com"/>
          </Form.Item>
          <Form.Item name="password" label="密码/授权码" rules={[{required: true, message: '请输入密码或授权码'}]}>
            <Input.Password placeholder="请输入对应的密码或授权码"/>
          </Form.Item>
          <Form.Item name="nickname" label="发件人昵称">
            <Input placeholder="请输入发件人昵称"/>
          </Form.Item>
        </Form>
        <Space style={{marginTop: 24}}>
          <Button loading={loading} onClick={handleEmailTest}>测试邮件服务</Button>
          <Button type="primary" loading={store.loading} onClick={handleSubmit}>保存设置</Button>
        </Space>
      </div>
    </React.Fragment>
  )
})