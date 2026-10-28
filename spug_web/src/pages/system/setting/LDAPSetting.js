/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useState } from 'react';
import styles from './index.module.css';
import { message } from 'libs/message';
import {Form, Button, Input, Space, Typography} from 'antd';
import { http } from 'libs';
import { observer } from 'mobx-react'
import store from './store';

export default observer(function () {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  function handleSubmit() {
    form.validateFields().then(formData => {
      store.loading = true;
      http.post('/api/setting/', {data: [{key: 'ldap_service', value: formData}]})
        .then(() => {
          message.success('保存成功');
          store.fetchSettings()
        })
        .finally(() => store.loading = false)
    })
  }

  function ldapTest() {
    form.validateFields().then(formData => {
      setLoading(true);
      http.post('/api/setting/ldap_test/', formData).then(() => {
        message.success('LDAP服务连接成功')
      }).finally(() => setLoading(false))
    })
  }

  return (
    <React.Fragment>
      <div className={styles.title}>LDAP设置</div>
      <div style={{maxWidth: 480}}>
        <Typography.Text type="secondary" style={{display: 'block', marginBottom: 16}}>配置 LDAP 服务以启用域账户登录认证</Typography.Text>
        <Form form={form} initialValues={store.settings.ldap_service} labelCol={{span: 6}} wrapperCol={{span: 18}}>
          <Form.Item name="server" label="服务地址" rules={[{required: true, message: '请输入LDAP服务地址'}]}>
            <Input placeholder="例如：ldap.spug.cc"/>
          </Form.Item>
          <Form.Item name="port" label="服务端口" rules={[{required: true, message: '请输入端口'}]}>
            <Input placeholder="例如：389"/>
          </Form.Item>
          <Form.Item name="admin_dn" label="管理员DN" rules={[{required: true, message: '请输入管理员DN'}]}>
            <Input placeholder="例如：cn=admin,dc=spug,dc=dev"/>
          </Form.Item>
          <Form.Item name="password" label="管理员密码" rules={[{required: true, message: '请输入管理员密码'}]}>
            <Input.Password placeholder="请输入LDAP管理员密码"/>
          </Form.Item>
          <Form.Item name="rules" label="搜索规则" rules={[{required: true, message: '请输入LDAP搜索规则'}]}>
            <Input placeholder="例如：cn"/>
          </Form.Item>
          <Form.Item name="base_dn" label="基本DN" rules={[{required: true, message: '请输入基本DN'}]}>
            <Input placeholder="例如：dc=spug,dc=dev"/>
          </Form.Item>
        </Form>
        <Space style={{marginTop: 24}}>
          <Button loading={loading} onClick={ldapTest}>测试LDAP</Button>
          <Button type="primary" loading={store.loading} onClick={handleSubmit}>保存设置</Button>
        </Space>
      </div>
    </React.Fragment>
  )
})