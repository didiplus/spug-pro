import React, { useEffect } from 'react';
import { observer } from 'mobx-react';
import { Tag, Space, Button, Popconfirm, message } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, InfoCircleOutlined, LinkOutlined } from '@ant-design/icons';
import store from '../store';
import { TableCard, AuthButton } from 'components';
// 状态颜色映射
const statusMap = {
  0: { text: '在线', color: 'green' },
  1: { text: '离线', color: 'red' },
};

const DatabaseTable = observer(() => {
  // 组件挂载时加载数据（如果 store 未初始加载）
  useEffect(() => {
    if (!store.list.length) {
      void store.loadData?.();  // 明确忽略返回值
    }
  }, []);

  // 表格列定义
  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      width: 150,
    },
    {
      title: '类型',
      dataIndex: 'type',
      render: (type) => <Tag color="blue">{type}</Tag>,
      width: 100,
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
    },
    {
      title: '操作',
      width: 220,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<InfoCircleOutlined />} size="small" onClick={() => store.showDetail(record)}>
            详情
          </Button>
          <Button type="link" icon={<LinkOutlined />} size="small" onClick={() => store.showSql(record)}>
            连接
          </Button>
          <Button type="link" icon={<EditOutlined />} size="small" onClick={() => store.showEdit(record)}>
            编辑
          </Button>
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

  // 分页配置（从 store 获取，若无则默认为空）
  const pagination = store.pagination
    ? {
      current: store.pagination.current,
      pageSize: store.pagination.pageSize,
      total: store.pagination.total,
      showSizeChanger: true,
      showQuickJumper: true,
      onChange: (page, pageSize) => {
        void store.setPagination?.({ current: page, pageSize });
        void store.loadData?.();  // 明确忽略返回值
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
        <AuthButton type="primary" icon={<PlusOutlined/>} onClick={() => store.showForm()}>新建连接</AuthButton>
      ]}
      pagination={pagination}
      onReload={() => store.loadData()}
      tKey="db_instances"
    />
  );
});

export default DatabaseTable;