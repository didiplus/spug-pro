import React, { useState, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Switch, message,
  Flex, Typography, Popconfirm, Tooltip, Badge,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, CloudOutlined,
  ApiOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { hasPermission } from 'libs';
import store from '../store';

const { Text } = Typography;

export default observer(function StorageConfig() {
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    await store.fetchStorageConfigs();
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ storage_type: 's3', enabled: true, is_default: false });
    setFormVisible(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      secret_key: '',
    });
    setFormVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await store.updateStorageConfig(editing.id, values);
        message.success('存储配置已更新');
      } else {
        await store.createStorageConfig(values);
        message.success('存储配置已创建');
      }
      setFormVisible(false);
    } catch (err) {
      if (err.response?.data?.error) {
        message.error(err.response.data.error);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await store.deleteStorageConfig(id);
      message.success('删除成功');
    } catch (err) {
      if (err.response?.data?.error) {
        message.error(err.response.data.error);
      }
    }
  };

  const handleTest = async () => {
    try {
      const values = await form.validateFields();
      setTesting(true);
      const res = await store.testStorageConfig(values);
      if (res.success) {
        message.success(`连接成功 | Bucket: ${res.bucket}, Region: ${res.region}`);
      } else {
        message.error(res.message || '连接失败');
      }
    } catch (err) {
      if (err.response?.data?.error) {
        message.error(err.response.data.error);
      }
    } finally {
      setTesting(false);
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      width: 150,
      render: (v, r) => (
        <Flex align="center" gap={8}>
          <CloudOutlined style={{ color: 'var(--color-primary)' }} />
          <Text strong>{v}</Text>
          {r.is_default && <Badge status="processing" text="默认" />}
        </Flex>
      ),
    },
    {
      title: '类型',
      dataIndex: 'storage_type',
      width: 100,
      render: (v) => <Tag color="blue">{v === 's3' ? 'S3 兼容' : v}</Tag>,
    },
    {
      title: 'Endpoint',
      dataIndex: 'endpoint_url',
      width: 200,
      ellipsis: true,
      render: (v) => v || <Text type="secondary">AWS 默认</Text>,
    },
    {
      title: 'Bucket',
      dataIndex: 'bucket',
      width: 120,
    },
    {
      title: 'Region',
      dataIndex: 'region',
      width: 100,
      render: (v) => v || '-',
    },
    {
      title: '前缀',
      dataIndex: 'prefix',
      width: 120,
      ellipsis: true,
      render: (v) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 80,
      render: (v) => v ? <Tag color="success">启用</Tag> : <Tag color="default">禁用</Tag>,
    },
    {
      title: '操作',
      width: 120,
      render: (_, r) => (
        <Space size="small">
          {hasPermission('database.instance.backup_add') && (
            <Tooltip title="编辑">
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
            </Tooltip>
          )}
          {hasPermission('database.instance.backup_del') && (
            <Popconfirm title="确认删除此存储配置？" onConfirm={() => handleDelete(r.id)}>
              <Tooltip title="删除">
                <Button type="link" danger size="small" icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <Flex justify="space-between" align="center">
        <Text type="secondary">配置 S3 兼容的远程存储后端（AWS S3 / MinIO / 华为云OBS / 阿里云OSS 等）</Text>
        {hasPermission('database.instance.backup_add') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建存储配置
          </Button>
        )}
      </Flex>

      <Table
        columns={columns}
        dataSource={store.storageConfigs}
        rowKey="id"
        size="middle"
        bordered
        loading={loading}
        pagination={false}
      />

      <Modal
        title={editing ? '编辑存储配置' : '新建存储配置'}
        open={formVisible}
        onCancel={() => setFormVisible(false)}
        width={560}
        footer={
          <Flex justify="space-between">
            <Button
              icon={<ApiOutlined />}
              loading={testing}
              onClick={handleTest}
            >
              测试连接
            </Button>
            <Space>
              <Button onClick={() => setFormVisible(false)}>取消</Button>
              <Button type="primary" loading={saving} onClick={handleSave}>保存</Button>
            </Space>
          </Flex>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="配置名称" rules={[{ required: true, message: '请输入配置名称' }]}>
            <Input placeholder="如：aws-s3-backup" />
          </Form.Item>
          <Form.Item name="storage_type" label="存储类型" rules={[{ required: true }]}>
            <Input disabled />
          </Form.Item>
          <Form.Item name="endpoint_url" label="Endpoint URL" tooltip="留空则使用 AWS 默认端点。MinIO/华为云/阿里云等需填写">
            <Input placeholder="如：https://s3.cn-north-1.myhuaweicloud.com" />
          </Form.Item>
          <Form.Item name="region" label="Region">
            <Input placeholder="如：cn-north-1" />
          </Form.Item>
          <Form.Item name="bucket" label="Bucket 名称" rules={[{ required: true, message: '请输入 Bucket 名称' }]}>
            <Input placeholder="如：spug-backups" />
          </Form.Item>
          <Form.Item name="prefix" label="Key 前缀" tooltip="备份文件在 Bucket 中的路径前缀">
            <Input placeholder="如：db-backups/production" />
          </Form.Item>
          <Form.Item name="access_key" label="Access Key" rules={[{ required: true, message: '请输入 Access Key' }]}>
            <Input placeholder="Access Key ID" />
          </Form.Item>
          <Form.Item
            name="secret_key"
            label="Secret Key"
            rules={editing ? [] : [{ required: true, message: '请输入 Secret Key' }]}
            extra={editing ? '留空则不修改已有的 Secret Key' : undefined}
          >
            <Input.Password placeholder="Secret Access Key" />
          </Form.Item>
          <Space size="large">
            <Form.Item name="is_default" label="设为默认" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Flex>
  );
});