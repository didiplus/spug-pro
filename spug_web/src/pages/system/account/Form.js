/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Modal, Form, Select, Input, Radio } from 'antd';
import { http, includes } from 'libs';
import store from './store';
import rStore from '../role/store';

export default observer(function () {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    http.get('/api/alarm/contact/?only_push=1')
      .then(res => {
        if (mountedRef.current) {
          setContacts(res);
        }
      });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function handleSubmit() {
    setLoading(true);
    const formData = form.getFieldsValue();
    formData.id = store.record.id;
    http.post('/api/account/user/', formData)
      .then(() => {
        if (mountedRef.current) {
          message.success('操作成功');
          store.formVisible = false;
          store.fetchRecords();
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setLoading(false);
        }
      })
      // 注意：无论成功失败，都要在成功分支中关闭 loading，否则可能导致按钮一直 loading
      .finally(() => {
        if (mountedRef.current) {
          setLoading(false);
        }
      });
  }

  return (
    <Modal
      open
      width={700}
      maskClosable={false}
      title={store.record.id ? '编辑账户' : '新建账户'}
      onCancel={() => store.formVisible = false}
      confirmLoading={loading}
      onOk={handleSubmit}>
      <Form form={form} initialValues={store.record} labelCol={{ span: 6 }} wrapperCol={{ span: 14 }}>
        <Form.Item required name="username" label="登录名">
          <Input placeholder="请输入登录名" />
        </Form.Item>
        <Form.Item required name="nickname" label="姓名">
          <Input placeholder="请输入姓名" />
        </Form.Item>
        <Form.Item required hidden={store.record.id} name="password" label="密码"
          extra="至少8位包含数字、小写和大写字母。">
          <Input.Password placeholder="请输入密码" />
        </Form.Item>
        <Form.Item name="phone" label="手机号" rules={[
          { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' },
        ]}>
          <Input placeholder="请输入手机号" />
        </Form.Item>
        <Form.Item name="email" label="邮箱" rules={[
          { pattern: /^[\w.-]+@[\w-]+(\.[\w-]+)+$/, message: '请输入正确的邮箱地址' },
        ]}>
          <Input placeholder="请输入邮箱" />
        </Form.Item>
        <Form.Item name="gender" label="性别" initialValue="male">
          <Radio.Group>
            <Radio value="male">男</Radio>
            <Radio value="female">女</Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item name="department" label="部门">
          <Input placeholder="请输入部门" />
        </Form.Item>
        <Form.Item hidden={store.record.is_supper} label="角色" style={{ marginBottom: 0 }}>
          <Form.Item name="role_ids" style={{ display: 'inline-block', width: '80%' }}
            extra="权限最大化原则，组合多个角色权限。">
            <Select mode="multiple" placeholder="请选择">
              {rStore.records.map(item => (
                <Select.Option value={item.id} key={item.id}>{item.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item style={{ display: 'inline-block', width: '20%', textAlign: 'right' }}>
            <Link to="/system/role">新建角色</Link>
          </Form.Item>
        </Form.Item>
        <Form.Item
          name="wx_token"
          label="MFA标识"
          extra={(
            <span>
              如果启用了MFA（两步验证）则该项为必填。
              <a target="_blank" rel="noopener noreferrer" href="https://push.spug.cc/guide/spug">如何获取MFA标识？</a>
            </span>
          )}>
          <Select showSearch allowClear filterOption={(i, o) => includes(o.children, i)}
            placeholder="请选择绑定推送标识">
            {contacts.map(item => (
              <Select.Option value={item.id} key={item.id}>{item.name}</Select.Option>
            ))}
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
});