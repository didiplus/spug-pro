import React, { useState } from 'react';
import { message } from 'libs/message';
import { Form, Input, Button } from 'antd';
import { http } from 'libs';
import history from 'libs/history';
import { clearMenuCache } from 'libs/menu';

export default function Reset() {
  const [loading, setLoading] = useState(false);
  const [old_password, setOldPassword] = useState('');
  const [new_password, setNewPassword] = useState('');
  const [new2_password, setNew2Password] = useState('');

  function handleSubmit() {
    if (!old_password) return message.error('请输入原密码');
    if (!new_password) return message.error('请输入新密码');
    if (new_password !== new2_password) return message.error('两次输入密码不一致');
    setLoading(true);
    http.patch('/api/account/self/', { old_password, new_password })
      .then(() => {
        message.success('密码修改成功');
        clearMenuCache();
        history.push('/');
        http.get('/api/account/logout/');
      })
      .finally(() => setLoading(false));
  }

  return (
    <Form layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 16 }} style={{ maxWidth: 480 }}>
      <Form.Item required label="原密码">
        <Input.Password value={old_password} placeholder="请输入原密码" onChange={e => setOldPassword(e.target.value)}/>
      </Form.Item>
      <Form.Item required label="新密码" extra="至少8位包含数字、小写和大写字母">
        <Input.Password value={new_password} placeholder="请输入新密码" onChange={e => setNewPassword(e.target.value)}/>
      </Form.Item>
      <Form.Item required label="确认密码">
        <Input.Password value={new2_password} placeholder="请再次输入新密码" onChange={e => setNew2Password(e.target.value)}/>
      </Form.Item>
      <Form.Item wrapperCol={{ offset: 4, span: 16 }}>
        <Button type="primary" loading={loading} onClick={handleSubmit}>保存配置</Button>
      </Form.Item>
    </Form>
  );
}
