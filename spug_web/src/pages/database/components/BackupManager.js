import React, { useState, useEffect, useCallback, useRef } from 'react';
import { observer } from 'mobx-react';
import {
  Table, Button, Space, Tag, Popconfirm, Modal, Form, Select, Input, message, Progress,
  Flex, Typography, Alert, Card, Statistic, Row, Col, Tooltip,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, DownloadOutlined, FileZipOutlined,
} from '@ant-design/icons';
import { http, X_TOKEN } from 'libs';
import { hasPermission } from 'libs';
import store from '../store';

const { Text } = Typography;

const statusMap = {
  pending: { text: '等待中', color: 'default' },
  running: { text: '备份中', color: 'processing' },
  success: { text: '成功', color: 'success' },
  failed: { text: '失败', color: 'error' },
};

const modeMap = {
  full: { text: '全量', color: 'blue' },
  incremental: { text: '增量', color: 'cyan' },
};

function formatSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default observer(function BackupManager() {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [form] = Form.useForm();

  const record = store.detailData || store.detailRecord || {};
  const live = store.detailData?.live;
  const dbOptions = live?.databases?.rows?.map((r) => ({
    label: r.name, value: r.name,
  })) || [];

  // 计算统计信息
  const successCount = records.filter(r => r.status === 'success').length;
  const failedCount = records.filter(r => r.status === 'failed').length;
  const totalSize = records.reduce((sum, r) => sum + (r.file_size || 0), 0);

  const fetchData = useCallback((p = page) => {
    if (!record.id) return;
    setLoading(true);
    http.get(`/api/db/instances/${record.id}/backups/`, { params: { page: p, page_size: 20 } })
      .then((res) => {
        setRecords(res.results || []);
        setTotal(res.total || 0);
      })
      .finally(() => setLoading(false));
  }, [record.id, page]);

  useEffect(() => {
    if (store.detailVisible && record.id) {
      fetchData(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.detailVisible]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      await http.post(`/api/db/instances/${record.id}/backups/`, values);
      message.success('备份任务已创建');
      setFormVisible(false);
      form.resetFields();
      fetchData(1);
    } catch (err) {
      if (err.response?.data?.error) {
        message.error(err.response.data.error);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (backupId) => {
    try {
      await http.delete(`/api/db/instances/${record.id}/backups/${backupId}/`);
      message.success('删除成功');
      fetchData();
    } catch (err) {
      message.error('删除失败');
    }
  };

  const [downloadState, setDownloadState] = useState({ visible: false, percent: 0, name: '', size: 0, loaded: 0 });
  const downloadAbortRef = useRef(null);

  const handleDownload = async (backup) => {
    if (!backup.file_path) {
      message.warning('备份文件不存在');
      return;
    }
    const url = `/api/db/instances/${record.id}/backups/${backup.id}/download/?x-token=${X_TOKEN}`;
    const fileName = backup.file_path.split('/').pop() || `backup_${backup.id}.sql.gz`;

    setDownloadState({ visible: true, percent: 0, name: fileName, size: backup.file_size || 0, loaded: 0 });
    const controller = new AbortController();
    downloadAbortRef.current = controller;

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`下载失败: ${response.status}`);

      const contentLength = Number(response.headers.get('content-length') || backup.file_size || 0);
      const reader = response.body.getReader();
      const chunks = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;
        const currentLength = receivedLength;
        const percent = contentLength > 0 ? Math.round((currentLength / contentLength) * 100) : 0;
        setDownloadState((prev) => ({ ...prev, percent, loaded: currentLength, size: contentLength || prev.size }));
      }

      const blob = new Blob(chunks);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      message.success('下载完成');
    } catch (err) {
      if (err.name === 'AbortError') {
        message.info('下载已取消');
      } else {
        message.error(err.message || '下载失败');
      }
    } finally {
      setDownloadState((prev) => ({ ...prev, visible: false }));
      downloadAbortRef.current = null;
    }
  };

  const handleCancelDownload = () => {
    if (downloadAbortRef.current) {
      downloadAbortRef.current.abort();
    }
  };

  const columns = [
    {
      title: '数据库',
      dataIndex: 'database',
      width: 120,
      render: (v) => v || '全部',
    },
    {
      title: '类型',
      dataIndex: 'mode',
      width: 80,
      render: (v) => {
        const m = modeMap[v] || { text: v, color: 'default' };
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (v) => {
        const s = statusMap[v] || { text: v, color: 'default' };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '文件大小',
      dataIndex: 'file_size',
      width: 100,
      render: (v) => formatSize(v),
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      width: 100,
      render: (v) => (v ? `${(v / 1000).toFixed(1)}s` : '-'),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      ellipsis: true,
      render: (v) => v || '-',
    },
    {
      title: '创建人',
      dataIndex: 'created_by_name',
      width: 90,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 170,
    },
    {
      title: '操作',
      width: 150,
      fixed: 'right',
      render: (_, r) => (
        <Space size="small">
          {r.status === 'success' && hasPermission('database.instance.backup_download') && (
            <Tooltip title="下载">
              <Button
                type="link"
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => handleDownload(r)}
              />
            </Tooltip>
          )}
          {hasPermission('database.instance.backup_del') && (
            <Popconfirm title="确认删除此备份？" onConfirm={() => handleDelete(r.id)}>
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
    <Flex vertical gap={16}>
      {/* 统计卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="备份总数" value={total} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="成功数" value={successCount} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="失败数" value={failedCount} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="总大小" value={formatSize(totalSize)} />
          </Card>
        </Col>
      </Row>

      {/* 操作栏 */}
      <Flex justify="space-between" align="center" wrap="wrap" gap="small">
        <Text type="secondary">共 {total} 条备份记录</Text>
        <Space>
          {hasPermission('database.instance.backup_add') && (
            <Button type="primary" size="middle" icon={<PlusOutlined />} onClick={() => setFormVisible(true)}>
              新建备份
            </Button>
          )}
          <Button size="middle" icon={<ReloadOutlined />} loading={loading} onClick={() => fetchData()}>
            刷新
          </Button>
        </Space>
      </Flex>

      {/* 警告提示 */}
      {records.some((r) => r.status === 'failed') && (
        <Alert
          type="warning"
          message="存在失败的备份任务，请检查数据库连接或磁盘空间"
          showIcon
          closable
        />
      )}

      {/* 表格 */}
      <Table
        columns={columns}
        dataSource={records}
        rowKey="id"
        size="middle"
        bordered
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={total > 20 ? {
          current: page,
          total,
          pageSize: 20,
          size: 'default',
          showSizeChanger: false,
          onChange: (p) => { setPage(p); fetchData(p); },
        } : false}
      />

      {/* 下载进度弹窗 */}
      <Modal
        title={<Flex align="center" gap={8}><FileZipOutlined />下载备份</Flex>}
        open={downloadState.visible}
        onCancel={handleCancelDownload}
        footer={<Button onClick={handleCancelDownload}>取消下载</Button>}
        width={460}
        closable={false}
        maskClosable={false}
      >
        <Flex vertical gap={16}>
          <Flex align="center" gap={8}>
            <FileZipOutlined style={{ fontSize: 24, color: '#1677ff' }} />
            <Flex vertical gap={2}>
              <Text strong style={{ fontSize: 13 }}>{downloadState.name}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {formatSize(downloadState.loaded)} / {formatSize(downloadState.size || downloadState.loaded)}
              </Text>
            </Flex>
          </Flex>
          <Progress
            percent={downloadState.percent}
            status={downloadState.percent >= 100 ? 'success' : 'active'}
            strokeColor={{ from: '#1677ff', to: '#52c41a' }}
          />
        </Flex>
      </Modal>

      {/* 新建备份弹窗 */}
      <Modal
        title="新建备份"
        open={formVisible}
        onCancel={() => { setFormVisible(false); form.resetFields(); }}
        onOk={handleCreate}
        confirmLoading={creating}
        width={480}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" initialValues={{ mode: 'full' }}>
          <Form.Item name="database" label="备份范围">
            <Select
              placeholder="全部数据库"
              allowClear
              options={[{ label: '全部数据库', value: '' }, ...dbOptions]}
            />
          </Form.Item>
          <Form.Item name="mode" label="备份类型">
            <Select>
              <Select.Option value="full">全量备份</Select.Option>
              <Select.Option value="incremental">增量备份</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="可选，最多200字" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </Flex>
  );
});