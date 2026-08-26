import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Button, Form, Input, Radio, Spin } from 'antd';
import { http } from 'libs';
import store from './store';

export default observer(function Basic() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    form.setFieldsValue({
      nickname: store.user.nickname,
      phone: store.user.phone,
      email: store.user.email,
      gender: store.user.gender || 'male',
    });
  }, [store.user]);

  function handleSubmit() {
    form.validateFields().then(values => {
      setLoading(true);
      http.patch('/api/account/self/', values)
        .then(() => {
          message.success('保存成功，昵称将在重新登录或刷新页面后生效');
          localStorage.setItem('nickname', values.nickname);
          store.fetchUser();
        })
        .finally(() => setLoading(false));
    });
  }

  return (
    <Spin spinning={store.fetching}>
      <Form form={form} layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 16 }}>
        <Form.Item
          required
          name="nickname"
          label="昵称"
          rules={[{ required: true, message: '请输入昵称' }]}
          extra="用户昵称不作为登录使用"
        >
          <Input placeholder="请输入昵称" style={{ maxWidth: 240 }}/>
        </Form.Item>
        <Form.Item
          required
          name="phone"
          label="手机号"
          rules={[
            { required: true, message: '请输入手机号' },
            { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' },
          ]}
          extra="手机号码不能重复"
        >
          <Input placeholder="请输入手机号" style={{ maxWidth: 240 }}/>
        </Form.Item>
        <Form.Item name="email" label="邮箱" rules={[
          { pattern: /^[\w.-]+@[\w-]+(\.[\w-]+)+$/, message: '请输入正确的邮箱地址' },
        ]}>
          <Input placeholder="请输入邮箱" style={{ maxWidth: 240 }}/>
        </Form.Item>
        <Form.Item name="gender" label="性别">
          <Radio.Group>
            <Radio value="male">男</Radio>
            <Radio value="female">女</Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item wrapperCol={{ offset: 4, span: 16 }}>
          <Button type="primary" loading={loading} onClick={handleSubmit}>保存配置</Button>
        </Form.Item>
      </Form>
    </Spin>
  );
});
