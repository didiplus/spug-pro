import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react';
import { Tag, Space, Button, Popconfirm, message, Input, Select, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, InfoCircleOutlined, LinkOutlined, SearchOutlined, ApiOutlined } from '@ant-design/icons';
import { http } from 'libs';
import store from '../store';
import { TableCard, AuthButton } from 'components';
import { hasPermission } from 'libs';
import { getDbTypeConfig, DB_TYPE_OPTIONS } from '../dbTypes';

const statusMap = {
  0: { text: '在线', color: 'green' },
  1: { text: '离线', color: 'red' },
};

const DatabaseTable = observer(() => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState(undefined);
  const [filterStatus, setFilterStatus] = useState(undefined);

  const doSearch = () => {
    store.pagination.current = 1;
    store.loadData({ search, type: filterType, status: filterStatus });
  };

  useEffect(() => {
    if (!store.list.length) {
      void store.loadData?.();
    }
    const timer = setInterval(() => {
      store.loadData({ search, type: filterType, status: filterStatus });
    }, 30000);
    return () => clearInterval(timer);
  }, [search, filterType, filterStatus]);

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      width: 150,
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: '类型',
      dataIndex: 'type',
      render: (type) => {
        const conf = getDbTypeConfig(type);
        return <Tag color={conf.tagColor}>{conf.label}</Tag>;
      },
      width: 110,
    },
    {
      title: '版本',
      dataIndex: 'version',
      width: 100,
    },
    {
      title: '地址',
      render: (_, record) => `${record.host}:${record.port}`,
      width: 180,
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status) => {
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
      width: 100,
      sorter: (a, b) => a.status - b.status,
    },
    {
      title: '操作',
      width: 260,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="测试连接">
            <Button type="link" icon={<ApiOutlined />} size="small" onClick={async () => {
              try {
                const res = await http.get(`/api/db/instances/${record.id}/test/`);
                if (res.online) {
                  message.success(`连接成功${res.latency ? ` (${res.latency}ms)` : ''}`);
                } else {
                  message.error('连接失败');
                }
                store.loadData({ search, type: filterType, status: filterStatus });
              } catch {
                message.error('测试失败');
              }
            }} />
          </Tooltip>
          <Button type="link" icon={<InfoCircleOutlined />} size="small" onClick={() => store.showDetail(record)}>
            详情
          </Button>
          {getDbTypeConfig(record.type).sql && hasPermission('database.instance.execute') && (
            <Button type="link" icon={<LinkOutlined />} size="small" onClick={() => store.showSql(record)}>
              连接
            </Button>
          )}
          {hasPermission('database.instance.edit') && (
            <Button type="link" icon={<EditOutlined />} size="small" onClick={() => store.showEdit(record)}>
              编辑
            </Button>
          )}
          {hasPermission('database.instance.del') && (
            <Popconfirm
              title="确认删除"
              description={`确定要删除 "${record.name}" 吗？`}
              onConfirm={() => handleDelete(record.id)}
              okText="删除"
              cancelText="取消"
            >
              <Button type="link" danger icon={<DeleteOutlined />} size="small">
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const handleDelete = async (id) => {
    try {
      await store.deleteDatabase?.(id);
      message.success('删除成功');
    } catch (error) {
      message.error('删除失败');
    }
  };

  const pagination = store.pagination
    ? {
      current: store.pagination.current,
      pageSize: store.pagination.pageSize,
      total: store.pagination.total,
      showSizeChanger: true,
      showQuickJumper: true,
      onChange: (page, pageSize) => {
        void store.setPagination?.({ current: page, pageSize });
        store.loadData({ search, type: filterType, status: filterStatus });
      },
    }
    : false;

  return (
    <TableCard
      title="数据库连接"
      rowKey="id"
      columns={columns}
      dataSource={store.list}
      loading={store.loading}
      actions={[
        <Space key="filter" size="small">
          <Input
            placeholder="搜索名称/地址"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={doSearch}
            style={{ width: 180 }}
            prefix={<SearchOutlined style={{ color: 'var(--color-text-tertiary)' }} />}
          />
          <Select
            placeholder="类型"
            allowClear
            value={filterType}
            onChange={(v) => { setFilterType(v); }}
            style={{ width: 120 }}
            options={DB_TYPE_OPTIONS}
          />
          <Select
            placeholder="状态"
            allowClear
            value={filterStatus}
            onChange={(v) => { setFilterStatus(v); }}
            style={{ width: 90 }}
            options={[
              { value: 0, label: '在线' },
              { value: 1, label: '离线' },
            ]}
          />
          <Button  icon={<SearchOutlined />} onClick={doSearch}>筛选</Button>
        </Space>,
        <AuthButton key="add" type="primary" icon={<PlusOutlined/>} auth="database.instance.add" onClick={() => store.showForm()}>新建连接</AuthButton>
      ]}
      pagination={pagination}
      onReload={() => store.loadData({ search, type: filterType, status: filterStatus })}
      tKey="db_instances"
    />
  );
});

export default DatabaseTable;