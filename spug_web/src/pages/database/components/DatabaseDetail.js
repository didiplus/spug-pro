import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import {
  Drawer, Button, Tag, Row, Col, Card, Tabs, Descriptions, Table, Space, Tooltip, Spin, message, Flex, Typography, Statistic, Alert,
} from 'antd';
import {
  CopyOutlined, ReloadOutlined,
  DatabaseOutlined, ThunderboltOutlined, SafetyOutlined,
  ApiOutlined, ClockCircleOutlined, CodeOutlined,
  DesktopOutlined,
} from '@ant-design/icons';
import store from '../store';
import SlowQuery from './SlowQuery';
import BackupManager from './BackupManager';

const { Text } = Typography;

const statusMap = {
  0: { text: '在线', color: 'success' },
  1: { text: '离线', color: 'error' },
};

const typeTagMap = {
  mysql: { color: 'blue', label: 'MySQL' },
  redis: { color: 'magenta', label: 'Redis' },
  postgresql: { color: 'purple', label: 'PostgreSQL' },
  mongodb: { color: 'cyan', label: 'MongoDB' },
};

const iconComponentMap = {
  api: <ApiOutlined />,
  thunderbolt: <ThunderboltOutlined />,
  clock: <ClockCircleOutlined />,
  database: <DatabaseOutlined />,
  desktop: <DesktopOutlined />,
  safety: <SafetyOutlined />,
};

function MetricCard({ label, value, color, icon }) {
  return (
    <Card size="small" style={{ textAlign: 'center', height: '100%' }} bodyStyle={{ padding: '16px 8px' }}>
      <div style={{ color, fontSize: 20, marginBottom: 8 }}>
        {iconComponentMap[icon] || <DatabaseOutlined />}
      </div>
      <Statistic value={value} valueStyle={{ color, fontSize: 22, fontWeight: 600 }} />
      <div style={{ marginTop: 4, color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>{label}</div>
    </Card>
  );
}

// 通用表格组件 - 优化列配置，适配 antd 5 默认样式
function GenericTable({ config, type }) {
  if (!config || !config.rows || config.rows.length === 0) {
    return (
      <Flex justify="center" style={{ padding: '40px 0' }}>
        <Text type="secondary">暂无数据</Text>
      </Flex>
    );
  }

  // 基础列定义
  let columns = (config.columns || []).map((col) => ({
    title: col.title,
    dataIndex: col.key,
    key: col.key,
    width: col.width,
    ellipsis: {
      showTitle: false, // 使用自定义 Tooltip 控制
    },
    render: (v) => {
      if (v === undefined || v === null) return '-';
      if (col.ellipsis) {
        return (
          <Tooltip title={String(v)} overlayStyle={{ maxWidth: 600 }}>
            <span>{String(v)}</span>
          </Tooltip>
        );
      }
      return v;
    },
  }));

  // 进程列表特殊列处理
  if (type === 'processes') {
    columns = columns.map((col) => {
      if (col.dataIndex === 'Time') {
        return {
          ...col,
          render: (v) => {
            if (v === undefined || v === null) return '-';
            const num = Number(v);
            const color = num > 5 ? '#ff4d4f' : 'inherit';
            return <span style={{ color, fontWeight: num > 5 ? 600 : 400 }}>{v}</span>;
          },
        };
      }
      if (col.dataIndex === 'Info') {
        return {
          ...col,
          width: 300,
          ellipsis: { showTitle: false },
          render: (v) => {
            if (!v) return '-';
            return (
              <Tooltip title={v} overlayStyle={{ maxWidth: 600 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>
              </Tooltip>
            );
          },
        };
      }
      return col;
    });
  }

  return (
    <Table
      columns={columns}
      dataSource={config.rows}
      size="middle"
      bordered
      pagination={config.rows.length > 15 ? { pageSize: 15, size: 'small', showSizeChanger: false } : false}
      rowKey={(r, i) => r.name || r.Id || r.state || i}
      scroll={{ x: 'max-content' }}
      style={{ marginTop: 8 }}
    />
  );
}

function BasicTab({ record }) {
  const handleCopy = (text) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        message.success('已复制到剪贴板');
      });
    }
  };

  const typeTag = typeTagMap[record.type] || { color: 'blue', label: record.type };

  return (
    <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} styles={{ label: { width: 120, fontWeight: 500 } }}>
      <Descriptions.Item label="实例名称">{record.name}</Descriptions.Item>
      <Descriptions.Item label="数据库类型">
        <Tag color={typeTag.color}>{typeTag.label}</Tag>
      </Descriptions.Item>
      <Descriptions.Item label="版本">{record.version || '-'}</Descriptions.Item>
      <Descriptions.Item label="运行状态">
        <Tag color={(statusMap[record.status] || {}).color || 'default'}>
          {(statusMap[record.status] || {}).text || '未知'}
        </Tag>
      </Descriptions.Item>
      <Descriptions.Item label="连接地址" span={2}>
        <Space>
          <Text code>{record.host}:{record.port}</Text>
          <Tooltip title="复制地址">
            <CopyOutlined style={{ color: '#8c8c8c', cursor: 'pointer' }} onClick={() => handleCopy(`${record.host}:${record.port}`)} />
          </Tooltip>
        </Space>
      </Descriptions.Item>
      <Descriptions.Item label="用户名">{record.username || '-'}</Descriptions.Item>
      <Descriptions.Item label="字符集">{record.charset || '-'}</Descriptions.Item>
      <Descriptions.Item label="创建人">{record.created_by_name || '-'}</Descriptions.Item>
      <Descriptions.Item label="创建时间">{record.created_at || '-'}</Descriptions.Item>
    </Descriptions>
  );
}

export default observer(function DatabaseDetail() {
  const [activeTab, setActiveTab] = useState('basic');

  useEffect(() => {
    if (store.detailVisible && store.detailRecord) {
      setActiveTab('basic');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.detailVisible]);

  if (!store.detailVisible) return null;

  const record = store.detailData || store.detailRecord || {};
  const live = record.live || null;
  const liveError = record.live_error || null;
  const typeTag = typeTagMap[record.type] || { color: 'blue', label: record.type || 'MySQL' };

  const handleRefresh = () => {
    if (record.id) {
      store.fetchDetail(record.id);
      message.info('正在刷新...');
    }
  };

  const handleOpenSql = () => {
    store.detailVisible = false;
    store.showSql(record);
  };

  const tabItems = [
    { key: 'basic', label: '基础信息', children: <BasicTab record={record} /> },
  ];

  if (live) {
    if (live.databases) {
      tabItems.push({
        key: 'databases',
        label: `数据库${live.databases.rows && live.databases.rows.length > 0 ? ` (${live.databases.rows.length})` : ''}`,
        children: <GenericTable config={live.databases} />,
      });
    }
    if (live.processes && live.processes.rows && live.processes.rows.length > 0) {
      tabItems.push({
        key: 'processes',
        label: `进程列表 (${live.processes.rows.length})`,
        children: <GenericTable config={live.processes} type="processes" />,
      });
    }
    if (live.variables && live.variables.rows && live.variables.rows.length > 0) {
      tabItems.push({
        key: 'variables',
        label: '状态变量',
        children: <GenericTable config={live.variables} />,
      });
    }
  }

  if (record.type === 'mysql') {
    tabItems.push({
      key: 'slow_query',
      label: '慢查询分析',
      children: <SlowQuery />,
    });
    tabItems.push({
      key: 'backup',
      label: '备份管理',
      children: <BackupManager />,
    });
  }

  return (
    <Drawer
      width={1000}
      placement="right"
      onClose={() => { store.detailVisible = false; }}
      open={store.detailVisible}
      styles={{ body: { padding: '24px' } }}
      title={
        <Flex align="center" gap={8}>
          <DatabaseOutlined style={{ color: '#1890ff' }} />
          <span style={{ fontWeight: 500 }}>{record.name}</span>
          <Tag color={(statusMap[record.status] || {}).color || 'default'}>
            {(statusMap[record.status] || {}).text || '未知'}
          </Tag>
          <Tag color={typeTag.color}>{typeTag.label}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.host}:{record.port}</Text>
        </Flex>
      }
      extra={
        <Space>
          <Button icon={<CodeOutlined />} size="middle" onClick={handleOpenSql}>SQL终端</Button>
          <Button icon={<ReloadOutlined />} size="middle" onClick={handleRefresh}>刷新</Button>
        </Space>
      }
    >
      <Spin spinning={store.detailLoading} tip="加载中...">
        {liveError && (
          <Alert
            type="error"
            message={`实时数据获取失败: ${liveError}`}
            showIcon
            style={{ marginBottom: 16 }}
            closable
          />
        )}

        {live && live.metrics && live.metrics.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Row gutter={[12, 12]}>
              {live.metrics.map((m) => (
                <Col key={m.key} xs={12} sm={6} md={Math.min(6, 24 / live.metrics.length)}>
                  <MetricCard label={m.label} value={m.value} color={m.color} icon={m.icon} />
                </Col>
              ))}
            </Row>
          </div>
        )}

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="middle"
          tabBarStyle={{ marginBottom: 16 }}
        />
      </Spin>
    </Drawer>
  );
});