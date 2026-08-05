import React, { useState, useEffect } from 'react';
import { Drawer, Form, Input, Select, Button, Space, message } from 'antd';
import store from '../store';
const { Option } = Select;

const DatabaseDrawer = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const isEdit = !!store.editRecord;

  const dbType = Form.useWatch('type', form);
  const isRedis = dbType === 'redis';

  useEffect(() => {
    if (store.formVisible) {
      if (store.editRecord) {
        form.setFieldsValue({
          name: store.editRecord.name,
          type: store.editRecord.type,
          host: store.editRecord.host,
          port: store.editRecord.port,
          username: store.editRecord.username || '',
          password: '',
          cluster: store.editRecord.cluster || '',
        });
      } else {
        form.resetFields();
      }
    } else {
      form.resetFields();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.formVisible]);

  const handleFinish = async (values) => {
    setLoading(true);
    try {
      const payload = { ...values, port: Number(values.port) };
      if (isEdit) {
        if (!payload.password) {
          delete payload.password;
        }
        await store.updateDatabase(store.editRecord.id, payload);
        message.success('更新成功');
      } else {
        await store.createDatabase(payload);
        message.success('创建成功');
      }
      store.formVisible = false;
      store.editRecord = null;
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || (isEdit ? '更新失败' : '创建失败');
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    store.formVisible = false;
    store.editRecord = null;
  };

  return (
    <Drawer
      title={isEdit ? '编辑数据库连接' : '新增数据库连接'}
      width={420}
      open={store.formVisible}
      onClose={handleCancel}
      extra={
        <Space>
          <Button onClick={handleCancel}>取消</Button>
          <Button type="primary" loading={loading} onClick={() => form.submit()}>
            保存
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{ type: 'mysql' }}
      >
        <Form.Item
          name="name"
          label="数据库名称"
          rules={[{ required: true, message: '请输入数据库名称' }]}
        >
          <Input placeholder="例如：mysql-prod" />
        </Form.Item>

        <Form.Item
          name="type"
          label="数据库类型"
          rules={[{ required: true, message: '请选择数据库类型' }]}
        >
          <Select placeholder="请选择数据库类型">
            <Option value="mysql">MySQL</Option>
            <Option value="redis">Redis</Option>
            <Option value="postgresql">PostgreSQL</Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="host"
          label="地址"
          rules={[{ required: true, message: '请输入主机地址' }]}
        >
          <Input placeholder="192.168.1.100 或 db.example.com" />
        </Form.Item>

        <Form.Item
          name="port"
          label="端口"
          rules={[{ required: true, message: '请输入端口号' }]}
        >
          <Input placeholder={isRedis ? '6379' : '3306'} />
        </Form.Item>

        <Form.Item
          name="username"
          label="用户名"
          rules={[
            {
              required: !isRedis,
              message: isRedis ? '用户名非必填' : '请输入用户名',
            },
          ]}
          extra={isRedis ? 'Redis 连接通常无需用户名，可留空' : ''}
        >
          <Input placeholder={isRedis ? '用户名（可选）' : 'root'} />
        </Form.Item>

        <Form.Item
          name="password"
          label="密码"
          rules={isEdit ? [] : [
            {
              required: !isRedis,
              message: isRedis ? '密码非必填' : '请输入密码',
            },
          ]}
          extra={isEdit ? '留空则不修改密码' : (isRedis ? 'Redis 连接通常无需密码，可留空' : '')}
        >
          <Input.Password placeholder={isEdit ? '留空不修改' : (isRedis ? '密码（可选）' : '请输入密码')} />
        </Form.Item>

        <Form.Item
          name="cluster"
          label="集群名称"
          extra="同一集群名称的实例将在拓扑图中分组展示"
        >
          <Input placeholder="例如：prod-cluster（可选）" />
        </Form.Item>

      </Form>
    </Drawer>
  );
};

export default DatabaseDrawer;
