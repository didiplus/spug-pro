import React, { useState, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react';
import { Tag, Space, Tabs, Table, Typography, Button, App } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, DownloadOutlined } from '@ant-design/icons';
import TerminalOutput from 'components/TerminalOutput';
import { http } from 'libs';
import { X_TOKEN } from 'libs';
import S from './store';

const { Text } = Typography;

function OutputView() {
  const [status, setStatus] = useState('running');
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  const token = S.runToken;

  const fetchStats = useCallback(() => {
    if (!token) return;
    setStatsLoading(true);
    http.get(`/api/ansible/playbooks/stats/${token}/`)
      .then(res => setStats(res))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [token]);

  useEffect(() => {
    if (status !== 'running' && status !== '') {
      const timer = setTimeout(fetchStats, 500);
      return () => clearTimeout(timer);
    }
  }, [status, fetchStats]);

  function handleStatusChange(newStatus) {
    setStatus(newStatus);
  }

  function handleDownloadLog() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const logUrl = `${protocol}//${window.location.host}/api/ws/subscribe/${token}/?x-token=${X_TOKEN}`;
    window.open(logUrl, '_blank');
  }

  const hostList = stats?.hosts ? Object.entries(stats.hosts).map(([id, info]) => ({
    id,
    name: info.name,
    hostname: info.hostname,
    stats: info.stats || {},
    ok: (info.stats?.failures || 0) === 0 && (info.stats?.unreachable || 0) === 0,
    changed: info.stats?.changed || 0,
    failures: info.stats?.failures || 0,
    unreachable: info.stats?.unreachable || 0,
  })) : [];

  const successCount = hostList.filter(h => h.ok).length;
  const failCount = hostList.filter(h => !h.ok).length;

  const filteredHosts = hostList.filter(h => {
    if (activeFilter === 'success') return h.ok;
    if (activeFilter === 'failed') return !h.ok;
    return true;
  });

  const statsColumns = [
    {
      title: '主机', dataIndex: 'name', width: 150,
      render: (name, record) => (
        <Space>
          {record.ok
            ? <CheckCircleOutlined style={{ color: 'var(--color-green-600)' }} />
            : <CloseCircleOutlined style={{ color: 'var(--color-red-600)' }} />}
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>({record.hostname})</Text>
        </Space>
      ),
    },
    {
      title: '状态', width: 80, align: 'center',
      render: (_, record) => record.ok
        ? <Tag color="success">成功</Tag>
        : <Tag color="error">失败</Tag>,
    },
    { title: '变更', dataIndex: 'changed', width: 70, align: 'center', render: v => v || '-' },
    { title: '失败', dataIndex: 'failures', width: 70, align: 'center', render: v => v || '-' },
    { title: '不可达', dataIndex: 'unreachable', width: 80, align: 'center', render: v => v || '-' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {stats && status !== 'running' && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <Tabs
            size="small"
            activeKey={activeFilter}
            onChange={setActiveFilter}
            items={[
              {
                key: 'all',
                label: <Space size={4}>全部 <Tag>{hostList.length}</Tag></Space>,
              },
              {
                key: 'success',
                label: <Space size={4}><CheckCircleOutlined style={{ color: 'var(--color-green-600)' }} /> 成功 <Tag color="success">{successCount}</Tag></Space>,
              },
              {
                key: 'failed',
                label: <Space size={4}><CloseCircleOutlined style={{ color: 'var(--color-red-600)' }} /> 失败 <Tag color="error">{failCount}</Tag></Space>,
              },
            ]}
          />
          {activeFilter !== 'all' && (
            <Table
              rowKey="id"
              columns={statsColumns}
              dataSource={filteredHosts}
              loading={statsLoading}
              size="small"
              pagination={false}
              scroll={{ y: 120 }}
              style={{ marginTop: 8 }}
            />
          )}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <TerminalOutput
          runToken={token}
          title="执行详情"
          cancelUrl="/api/ansible/playbooks/cancel/"
          onStatusChange={handleStatusChange}
        />
      </div>
    </div>
  );
}

export default observer(OutputView);
