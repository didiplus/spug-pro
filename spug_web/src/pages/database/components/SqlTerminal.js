import React, { useState, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react';
import {
  Drawer, Button, Table, Select, Space, Tag, Alert, Spin, message, Tooltip, Divider, Flex, Typography, Popconfirm, Empty,
} from 'antd';
import {
  PlayCircleOutlined, ClearOutlined, HistoryOutlined,
  DatabaseOutlined, ThunderboltOutlined, ClockCircleOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ConsoleSqlOutlined,
  DeleteOutlined, ReloadOutlined, CopyOutlined,
} from '@ant-design/icons';
import { http } from 'libs';
import { ACEditor } from 'components';
import store from '../store';
import styles from '../index.module.less';

const { Text } = Typography;

function SqlHistoryPanel({ instanceId, onUseSql }) {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchData = useCallback((p = page) => {
    if (!instanceId) return;
    setLoading(true);
    http.get(`/api/db/instances/${instanceId}/sql-history/`, { params: { page: p, page_size: 15 } })
      .then((res) => {
        setRecords(res.results || []);
        setTotal(res.total || 0);
      })
      .finally(() => setLoading(false));
  }, [instanceId, page]);

  useEffect(() => {
    if (instanceId) fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  const handleDelete = async (id) => {
    try {
      await http.delete(`/api/db/instances/${instanceId}/sql-history/${id}/`);
      message.success('已删除');
      fetchData();
    } catch {
      message.error('删除失败');
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(() => message.success('已复制'));
  };

  const columns = [
    {
      title: 'SQL',
      dataIndex: 'sql',
      ellipsis: true,
      render: (v) => (
        <Tooltip title={v}>
          <Text style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', fontSize: 12 }}>{v}</Text>
        </Tooltip>
      ),
    },
    {
      title: '数据库',
      dataIndex: 'database',
      width: 100,
      render: (v) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 70,
      render: (v) => (
        <Tag color={v === 'success' ? 'success' : 'error'} style={{ fontSize: 11 }}>
          {v === 'success' ? '成功' : '失败'}
        </Tag>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      width: 80,
      render: (v) => v ? `${v}ms` : '-',
    },
    {
      title: '行数',
      dataIndex: 'rows_count',
      width: 70,
      render: (v) => v ?? '-',
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 150,
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: '操作',
      width: 100,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="使用此SQL">
            <Button type="link" size="small" icon={<ConsoleSqlOutlined />} onClick={() => onUseSql(r.sql, r.database)} />
          </Tooltip>
          <Tooltip title="复制">
            <Button type="link" size="small" icon={<CopyOutlined />} onClick={() => handleCopy(r.sql)} />
          </Tooltip>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Flex vertical gap={8}>
      <Flex justify="space-between" align="center">
        <Text type="secondary">共 {total} 条记录</Text>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => fetchData()}>刷新</Button>
      </Flex>
      <Table
        columns={columns}
        dataSource={records}
        rowKey="id"
        size="small"
        loading={loading}
        pagination={total > 15 ? {
          current: page, total, pageSize: 15, size: 'small',
          onChange: (p) => { setPage(p); fetchData(p); },
        } : false}
        locale={{ emptyText: <Empty description="暂无执行历史" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />
    </Flex>
  );
}

export default observer(function SqlTerminal() {
  const [sql, setSql] = useState('');
  const [database, setDatabase] = useState('');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [costTime, setCostTime] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const record = store.sqlRecord || {};
  const live = store.detailData?.live;
  const dbOptions = live?.databases?.rows?.map((r) => ({
    label: r.name, value: r.name,
  })) || [];

  const handleExecute = useCallback(() => {
    const trimmed = sql.trim();
    if (!trimmed) {
      message.warning('请输入 SQL 语句');
      return;
    }
    setExecuting(true);
    setResult(null);
    setError(null);
    setCostTime(null);

    const start = Date.now();
    http.post('/api/db/execute/', { id: record.id, sql: trimmed, database: database || undefined })
      .then((res) => {
        setCostTime(Date.now() - start);
        setResult(res);
        setHistoryKey((k) => k + 1);
      })
      .catch((err) => {
        setCostTime(Date.now() - start);
        setError(err.response?.data?.error || err.message || '执行失败');
        setHistoryKey((k) => k + 1);
      })
      .finally(() => setExecuting(false));
  }, [sql, database, record.id]);

  if (!store.sqlVisible) return null;

  const handleUseHistory = (sqlText, db) => {
    setSql(sqlText);
    if (db) setDatabase(db);
    setShowHistory(false);
  };

  const columns = (result?.columns || []).map((col) => ({
    title: col,
    dataIndex: col,
    key: col,
    ellipsis: true,
    width: 150,
    render: (v) => (v === null ? <Text type="secondary" italic>NULL</Text> : String(v)),
  }));

  return (
    <Drawer
      width={1000}
      placement="right"
      onClose={() => { store.sqlVisible = false; }}
      open={store.sqlVisible}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
      title={
        <Flex align="center" gap={8}>
          <ConsoleSqlOutlined style={{ color: '#1677ff' }} />
          <span>SQL 终端</span>
          <Tag color="blue">{record.name}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.host}:{record.port}</Text>
        </Flex>
      }
    >
      <div className={styles.sqlBody}>
        <div className={styles.sqlEditorSection}>
          <div className={styles.sqlBar}>
            <Flex align="center" gap={8}>
              <DatabaseOutlined style={{ color: '#1677ff' }} />
              <Text strong style={{ fontSize: 13 }}>查询编辑器</Text>
              {dbOptions.length > 0 && (
                <>
                  <Divider type="vertical" />
                  <Select
                    size="small"
                    value={database}
                    onChange={setDatabase}
                    placeholder="选择数据库"
                    style={{ width: 160 }}
                    allowClear
                    options={dbOptions}
                    suffixIcon={<DatabaseOutlined />}
                  />
                </>
              )}
            </Flex>
            <Space size={4}>
              <Button
                type="primary"
                size="small"
                icon={<PlayCircleOutlined />}
                loading={executing}
                onClick={handleExecute}
              >
                执行
              </Button>
              <Tooltip title="Ctrl+Enter 快捷执行">
                <Tag style={{ cursor: 'help', fontSize: 11 }}>Ctrl+Enter</Tag>
              </Tooltip>
              <Divider type="vertical" />
              <Button
                size="small"
                type={showHistory ? 'default' : 'text'}
                icon={<HistoryOutlined />}
                onClick={() => setShowHistory((v) => !v)}
              >
                历史
              </Button>
              <Button size="small" icon={<ClearOutlined />} onClick={() => { setSql(''); setResult(null); setError(null); setCostTime(null); }}>
                清空
              </Button>
            </Space>
          </div>
          <div className={styles.sqlEditorWrap}>
            <ACEditor
              mode="sql"
              value={sql}
              onChange={(val) => setSql(val)}
              placeholder="输入 SQL 语句，Ctrl+Enter 执行..."
              height="180px"
              width="100%"
            />
          </div>
        </div>

        {showHistory && (
          <div style={{ borderBottom: '1px solid #f0f0f0', maxHeight: 300, overflow: 'auto', padding: '8px 16px' }}>
            <SqlHistoryPanel key={historyKey} instanceId={record.id} onUseSql={handleUseHistory} />
          </div>
        )}

        <div className={styles.sqlResultSection}>
          <div className={styles.sqlBar}>
            <Flex align="center" gap={8}>
              <ThunderboltOutlined style={{ color: '#1677ff' }} />
              <Text strong style={{ fontSize: 13 }}>执行结果</Text>
            </Flex>
            <Space size={8}>
              {costTime !== null && (
                <Tag icon={<ClockCircleOutlined />}>{costTime} ms</Tag>
              )}
              {result && result.columns.length > 0 && (
                <Tag icon={<DatabaseOutlined />} color="blue">{result.rows.length} 行</Tag>
              )}
              {result && result.columns.length === 0 && result.affected !== undefined && (
                <Tag icon={<CheckCircleOutlined />} color="success">影响 {result.affected} 行</Tag>
              )}
              {result?.truncated && (
                <Tag icon={<CloseCircleOutlined />} color="warning">结果已截断</Tag>
              )}
            </Space>
          </div>

          <div className={styles.sqlResultBody}>
            {executing && (
              <Flex vertical align="center" justify="center" style={{ padding: '80px 0' }}>
                <Spin size="large" />
                <Text type="secondary" style={{ marginTop: 12 }}>正在执行查询...</Text>
              </Flex>
            )}

            {error && (
              <div style={{ padding: '12px 16px' }}>
                <Alert
                  type="error"
                  message="执行错误"
                  description={error}
                  closable
                  onClose={() => setError(null)}
                  showIcon
                />
              </div>
            )}

            {result && result.columns.length > 0 && (
              <Table
                columns={columns}
                dataSource={result.rows.map((r, i) => ({ ...r, _key: i }))}
                rowKey="_key"
                size="small"
                pagination={result.rows.length > 50 ? { pageSize: 50, size: 'small', showSizeChanger: false } : false}
                scroll={{ x: columns.length * 150 }}
              />
            )}

            {result && result.columns.length === 0 && !error && (
              <Flex vertical align="center" justify="center" style={{ padding: '60px 0' }}>
                <CheckCircleOutlined style={{ fontSize: 32, color: '#52c41a' }} />
                <Text style={{ marginTop: 8, color: '#52c41a', fontWeight: 500 }}>执行成功</Text>
                {result.affected !== undefined && (
                  <Text type="secondary" style={{ marginTop: 4 }}>影响 {result.affected} 行</Text>
                )}
              </Flex>
            )}

            {!executing && !error && !result && (
              <Flex vertical align="center" justify="center" style={{ padding: '100px 0' }}>
                <ConsoleSqlOutlined style={{ fontSize: 40, color: '#d9d9d9' }} />
                <Text type="secondary" style={{ marginTop: 8 }}>输入 SQL 并执行查看结果</Text>
                <Text type="secondary" style={{ fontSize: 12, marginTop: 4, color: '#d9d9d9' }}>支持 SELECT / INSERT / UPDATE / DELETE 等语句</Text>
              </Flex>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
});
