import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, Switch, message,
  Flex, Typography, Popconfirm, Tooltip, Badge,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, CloudOutlined, ApiOutlined,
} from '@ant-design/icons';
import { http } from 'libs';

const { Text } = Typography;

const STORAGE_TYPES = [
  { value: 's3', label: 'S3 兼容存储', color: 'blue', endpointHint: '留空则使用 AWS 默认端点。MinIO / Ceph 等需填写', endpointPlaceholder: '如：http://minio:9000' },
  { value: 'oss', label: '阿里云 OSS', color: 'orange', endpointHint: '留空则根据 Region 自动生成（如 https://oss-cn-hangzhou.aliyuncs.com）', endpointPlaceholder: '如：https://oss-cn-hangzhou.aliyuncs.com' },
  { value: 'cos', label: '腾讯云 COS', color: 'green', endpointHint: '如：https://cos.ap-guangzhou.myqcloud.com', endpointPlaceholder: '如：https://cos.ap-guangzhou.myqcloud.com' },
  { value: 'obs', label: '华为云 OBS', color: 'red', endpointHint: '如：https://obs.cn-north-4.myhuaweicloud.com', endpointPlaceholder: '如：https://obs.cn-north-4.myhuaweicloud.com' },
];

const TYPE_MAP = Object.fromEntries(STORAGE_TYPES.map(t => [t.value, t]));

export default function StorageSetting() {
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get('/api/setting/storage-configs/');
      setConfigs(res || []);
    } finally {
      setLoading(false);
    }
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
    form.setFieldsValue({ ...record, secret_key: '' });
    setFormVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await http.put(`/api/setting/storage-configs/${editing.id}/`, values);
        message.success('存储配置已更新');
      } else {
        await http.post('/api/setting/storage-configs/', values);
        message.success('存储配置已创建');
      }
      setFormVisible(false);
      fetchData();
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
      await http.delete(`/api/setting/storage-configs/${id}/`);
      message.success('删除成功');
      fetchData();
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
      const res = await http.post('/api/setting/storage-configs/test/', values);
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
          <CloudOutlined style={{ color: '#1677ff' }} />
          <Text strong>{v}</Text>
          {r.is_default && <Badge status="processing" text="默认" />}
        </Flex>
      ),
    },
    {
      title: '类型',
      dataIndex: 'storage_type',
      width: 120,
      render: (v) => {
        const cfg = TYPE_MAP[v] || { label: v, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
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
          <Tooltip title="编辑">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Popconfirm title="确认删除此存储配置？" onConfirm={() => handleDelete(r.id)}>
            <Tooltip title="删除">
              <Button type="link" danger size="small" icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <Flex justify="space-between" align="center">
        <Text type="secondary">配置远程存储后端，支持 S3 兼容存储 / 阿里云 OSS / 腾讯云 COS / 华为云 OBS</Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建存储配置
        </Button>
      </Flex>

      <Table
        columns={columns}
        dataSource={configs}
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
            <Button icon={<ApiOutlined />} loading={testing} onClick={handleTest}>
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
          <Form.Item name="storage_type" label="存储类型" rules={[{ required: true, message: '请选择存储类型' }]}>
            <Select
              disabled={!!editing}
              options={STORAGE_TYPES.map(t => ({ value: t.value, label: t.label }))}
              placeholder="请选择存储类型"
            />
          </Form.Item>
          <Form.Item noStyle dependencies={['storage_type']}>
            {({ getFieldValue }) => {
              const typeCfg = TYPE_MAP[getFieldValue('storage_type')] || TYPE_MAP.s3;
              return (
                <Form.Item
                  name="endpoint_url"
                  label="Endpoint URL"
                  tooltip={typeCfg.endpointHint}
                >
                  <Input placeholder={typeCfg.endpointPlaceholder} />
                </Form.Item>
              );
            }}
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
}