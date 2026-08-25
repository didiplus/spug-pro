import React, { useState, useEffect, useCallback, useRef } from 'react';
import { observer } from 'mobx-react';
import {
  Table, Button, Space, Tag, Popconfirm, Modal, Form, Select, Input, message, Progress,
  Flex, Typography, Alert, Card, Statistic, Row, Col, Tooltip, Switch, InputNumber, Divider,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, DownloadOutlined, FileZipOutlined,
  SettingOutlined, ClearOutlined, CloudUploadOutlined,
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
  const [policyVisible, setPolicyVisible] = useState(false);
  const [policyForm] = Form.useForm();
  const [policySaving, setPolicySaving] = useState(false);
  const [pollingIds, setPollingIds] = useState(new Set());


  const record = store.detailData || store.detailRecord || {};
  const live = store.detailData?.live;
  const dbOptions = live?.databases?.rows?.map((r) => ({
    label: r.name, value: r.name,
  })) || [];

  useEffect(() => {
    store.fetchStorageConfigs();
  }, []);

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
      const res = await http.post(`/api/db/instances/${record.id}/backups/`, values);
      message.success('备份任务已创建，正在异步执行');
      setFormVisible(false);
      form.resetFields();
      fetchData(1);
      pollBackupStatus(res.id);
    } catch (err) {
      if (err.response?.data?.error) {
        message.error(err.response.data.error);
      }
    } finally {
      setCreating(false);
    }
  };

  const pollBackupStatus = (backupId) => {
    setPollingIds(prev => new Set([...prev, backupId]));
    const timer = setInterval(async () => {
      try {
        const res = await http.get(`/api/db/instances/${record.id}/backups/${backupId}/status/`);
        setRecords(prev => prev.map(r => r.id === backupId ? { ...r, status: res.status, progress: res.progress } : r));
        if (res.status === 'success' || res.status === 'failed') {
          clearInterval(timer);
          setPollingIds(prev => {
            const next = new Set(prev);
            next.delete(backupId);
            return next;
          });
          fetchData();
        }
      } catch {
        clearInterval(timer);
      }
    }, 2000);
  };

  const handleSavePolicy = async () => {
    try {
      const values = await policyForm.validateFields();
      setPolicySaving(true);
      await store.saveRetentionPolicy(record.id, values);
      message.success('保留策略已保存');
      setPolicyVisible(false);
    } catch (err) {
      if (err.response?.data?.error) {
        message.error(err.response.data.error);
      }
    } finally {
      setPolicySaving(false);
    }
  };

  const handleCleanup = async () => {
    try {
      const res = await store.cleanupBackups(record.id);
      message.success(`已清理 ${res.deleted || 0} 个过期备份`);
      fetchData();
    } catch (err) {
      message.error('清理失败');
    }
  };

  const openPolicyModal = async () => {
    await store.fetchRetentionPolicy(record.id);
    const p = store.retentionPolicy;
    policyForm.setFieldsValue(p || { strategy_type: 'count', keep_count: 30, keep_days: 7, keep_weekly: 4, keep_monthly: 12, enabled: true, auto_cleanup: true });
    setPolicyVisible(true);
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
    if (!backup.file_path && !backup.remote_path) {
      message.warning('备份文件不存在');
      return;
    }
    const url = `/api/db/instances/${record.id}/backups/${backup.id}/download/?x-token=${X_TOKEN}`;
    const fileName = (backup.file_path || backup.remote_path || '').split('/').pop() || `backup_${backup.id}.sql.gz`;

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
      width: 100,
      render: (v, r) => {
        const s = statusMap[v] || { text: v, color: 'default' };
        if (v === 'running' || v === 'pending') {
          return (
            <Flex vertical gap={4}>
              <Tag color={s.color}>{s.text}</Tag>
              <Progress percent={r.progress || 0} size="small" />
            </Flex>
          );
        }
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
      title: '存储',
      width: 100,
      render: (_, r) => {
        if (r.storage_status === 'uploaded') {
          return <Tag color="success" icon={<CloudUploadOutlined />}>远程</Tag>;
        }
        if (r.storage_status === 'upload_failed') {
          return <Tooltip title={r.error_message || '上传失败'}><Tag color="error">上传失败</Tag></Tooltip>;
        }
        if (r.remote_path) {
          return <Tag color="blue">远程</Tag>;
        }
        return <Tag color="default">本地</Tag>;
      },
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
          {r.status === 'success' && (r.file_path || r.remote_path) && hasPermission('database.instance.backup_download') && (
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
          {hasPermission('database.instance.backup_add') && (
            <Button size="middle" icon={<SettingOutlined />} onClick={openPolicyModal}>
              保留策略
            </Button>
          )}

          {hasPermission('database.instance.backup_del') && (
            <Popconfirm title="确认按保留策略清理过期备份？" onConfirm={handleCleanup}>
              <Button size="middle" icon={<ClearOutlined />}>
                清理过期
              </Button>
            </Popconfirm>
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
        scroll={{ x: 1300 }}
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
          <Form.Item name="storage_config_id" label="远程存储" tooltip="选择后将备份文件上传到远程 S3 兼容存储">
            <Select
              placeholder="仅本地存储"
              allowClear
              options={store.storageConfigs
                .filter(c => c.enabled)
                .map(c => ({ label: `${c.name} (${c.bucket})`, value: c.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 保留策略弹窗 */}
      <Modal
        title="保留策略配置"
        open={policyVisible}
        onCancel={() => setPolicyVisible(false)}
        onOk={handleSavePolicy}
        confirmLoading={policySaving}
        width={520}
        okText="保存"
        cancelText="取消"
      >
        <Form form={policyForm} layout="vertical">
          <Form.Item name="strategy_type" label="策略类型" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="count">按数量保留（保留最近 N 个）</Select.Option>
              <Select.Option value="time">按时间保留（保留最近 N 天）</Select.Option>
              <Select.Option value="gfs">GFS 祖父-父-子（分层保留）</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {({ getFieldValue }) => {
              const st = getFieldValue('strategy_type');
              return (
                <>
                  {(st === 'count' || st === 'gfs') && (
                    <Form.Item name="keep_count" label="保留数量（个）" rules={[{ required: true }]}>
                      <InputNumber min={1} max={999} style={{ width: '100%' }} placeholder="如 30" />
                    </Form.Item>
                  )}
                  {(st === 'time' || st === 'gfs') && (
                    <Form.Item name="keep_days" label="保留天数（天）" rules={[{ required: true }]}>
                      <InputNumber min={1} max={3650} style={{ width: '100%' }} placeholder="如 7" />
                    </Form.Item>
                  )}
                  {st === 'gfs' && (
                    <>
                      <Form.Item name="keep_weekly" label="保留周数（周）" rules={[{ required: true }]}>
                        <InputNumber min={1} max={520} style={{ width: '100%' }} placeholder="如 4" />
                      </Form.Item>
                      <Form.Item name="keep_monthly" label="保留月数（月）" rules={[{ required: true }]}>
                        <InputNumber min={1} max={120} style={{ width: '100%' }} placeholder="如 12" />
                      </Form.Item>
                    </>
                  )}
                </>
              );
            }}
          </Form.Item>
          <Divider />
          <Form.Item name="enabled" label="启用策略" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="auto_cleanup" label="备份后自动清理" valuePropName="checked" tooltip="每次备份成功后自动按策略清理过期备份">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

    </Flex>
  );
});