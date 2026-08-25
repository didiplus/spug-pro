import React, { useState, useEffect } from 'react';
import { Table, Tag, Input, Button } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { http } from 'libs';
import store from './store';

const STATUS_MAP = {
  success: { color: 'success', text: '成功' },
  failed: { color: 'error', text: '失败' },
  pending: { color: 'processing', text: '进行中' },
};

export default function OperationLog() {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');

  function fetchLogs(p = page, ps = pageSize) {
    setLoading(true);
    const params = { page: p, page_size: ps, username: store.user.username || '' };
    http.get('/api/log/operotionlog/', { params })
      .then(res => {
        setRecords(res.results);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (store.user.username) fetchLogs(1, 10);
  }, [store.user.username]);

  const columns = [
    { title: '模块', dataIndex: 'module', width: 120, ellipsis: true },
    { title: '请求方法', dataIndex: 'method', width: 90, align: 'center',
      render: v => v ? <Tag color="blue">{v}</Tag> : '-' },
    { title: '请求路径', dataIndex: 'uri', ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 80, align: 'center',
      render: v => {
        const cfg = STATUS_MAP[v] || { color: 'default', text: v || '-' };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      }},
    { title: '客户端IP', dataIndex: 'client_ip', width: 130 },
    { title: '耗时(ms)', dataIndex: 'cost_time', width: 90, align: 'center',
      render: v => v != null ? v : '-' },
    { title: '时间', dataIndex: 'create_time', width: 170 },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Input
          allowClear
          placeholder="搜索模块"
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }}/>}
          style={{ width: 220 }}
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onPressEnter={() => fetchLogs(1)}
        />
        <Button icon={<ReloadOutlined/>} onClick={() => fetchLogs()}>刷新</Button>
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={records}
        pagination={{
          current: page,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showTotal: t => `共 ${t} 条`,
          pageSizeOptions: ['10', '20', '50'],
          onChange: (p, ps) => { setPage(p); setPageSize(ps); fetchLogs(p, ps); },
        }}
      />
    </div>
  );
}