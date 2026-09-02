import React, { useState, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react';
import {
  Card, Row, Col, Statistic, Table, Tabs,Tooltip, Button, Spin, Alert, Flex, Typography,
} from 'antd';
import {
  ClockCircleOutlined, ApiOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { http } from 'libs';
import store from '../store';
import { getDbTypeConfig } from '../dbTypes';

const { Text } = Typography;

const iconMap = {
  clock: <ClockCircleOutlined />,
  api: <ApiOutlined />,
};

function MetricCards({ metrics }) {
  if (!metrics || metrics.length === 0) return null;
  return (
    <Row gutter={12}>
      {metrics.map((m) => (
        <Col key={m.key} span={Math.max(4, Math.floor(24 / metrics.length))}>
          <Card size="small" style={{ textAlign: 'center' }} styles={{ body: { padding: '12px 8px' } }}>
            <div style={{ color: m.color, fontSize: 18, marginBottom: 4 }}>{iconMap[m.icon] || <ClockCircleOutlined />}</div>
            <Statistic value={m.value} valueStyle={{ color: m.color, fontSize: 20, fontWeight: 600 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>{m.label}</Text>
          </Card>
        </Col>
      ))}
    </Row>
  );
}

function QueryTable({ config, title }) {
  if (!config || !config.rows || config.rows.length === 0) {
    return <Flex justify="center" style={{ padding: '40px 0' }}><Text type="secondary">暂无{title}</Text></Flex>;
  }
  const columns = (config.columns || []).map((col) => ({
    title: col.title,
    dataIndex: col.key,
    key: col.key,
    width: col.width,
    ellipsis: col.ellipsis || false,
    render: col.ellipsis
      ? (v) => v ? (
          <Tooltip title={String(v)}>
            <Text style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', fontSize: 12 }}>{String(v)}</Text>
          </Tooltip>
        ) : '-'
      : (v) => v !== undefined && v !== null ? String(v) : '-',
  }));
  return (
    <Table
      columns={columns}
      dataSource={config.rows.map((r, i) => ({ ...r, _key: i }))}
      rowKey="_key"
      size="small"
      pagination={config.rows.length > 15 ? { pageSize: 15, size: 'small' } : false}
      scroll={{ x: 'max-content' }}
    />
  );
}

export default observer(function SlowQuery() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');

  const record = store.detailData || store.detailRecord || {};

  const fetchData = useCallback(() => {
    if (!record.id) return;
    setLoading(true);
    setError(null);
    http.get(`/api/db/instances/${record.id}/slow-queries/`)
      .then((res) => setData(res))
      .catch((err) => setError(err.response?.data?.error || err.message || '获取慢查询失败'))
      .finally(() => setLoading(false));
  }, [record.id]);

  useEffect(() => {
    if (store.detailVisible && record.id && getDbTypeConfig(record.type).slowQuery) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.detailVisible]);

  if (!getDbTypeConfig(record.type).slowQuery) {
    return <Flex justify="center" style={{ padding: '40px 0' }}><Text type="secondary">当前数据库类型不支持慢查询分析</Text></Flex>;
  }

  const tabItems = [
    {
      key: 'summary',
      label: data?.summary?.rows?.length ? `慢查询汇总 (${data.summary.rows.length})` : '慢查询汇总',
      children: <QueryTable config={data?.summary} title="慢查询汇总" />,
    },
    {
      key: 'recent',
      label: data?.recent?.rows?.length ? `最近慢查询 (${data.recent.rows.length})` : '最近慢查询',
      children: <QueryTable config={data?.recent} title="最近慢查询" />,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <Flex justify="flex-end">
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={fetchData}>刷新</Button>
      </Flex>

      {loading && !data && (
        <Flex justify="center" style={{ padding: '60px 0' }}>
          <Spin size="large" />
        </Flex>
      )}

      {error && (
        <Alert type="error" message={error} showIcon closable onClose={() => setError(null)} />
      )}

      {data && data.metrics && (
        <div style={{ background: 'var(--color-gray-50)', padding: 12, borderRadius: 'var(--radius-md)' }}>
          <MetricCards metrics={data.metrics} />
        </div>
      )}

      {data && (
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="small" />
      )}
    </Flex>
  );
});