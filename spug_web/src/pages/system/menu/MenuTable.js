import React from 'react';
import { Table, Typography, Tag, Space, Tooltip, Button } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { hasPermission } from 'libs';
import { IconRegistry } from '../../../routes';
import { IconByName } from '../../../components/IconSelect';
import { TYPE_CONFIG } from './utils';

const { Text } = Typography;

export default function MenuTable({
  menus,
  loading,
  expandedKeys,
  onExpandedRowsChange,
  onAdd,
  onEdit,
  onDelete,
}) {
  const columns = [
    {
      title: '菜单名称',
      dataIndex: 'menu_name',
      key: 'menu_name',
      width: 220,
      render: (text, record) => (
        <Space size={6}>
          {record.icon && IconRegistry[record.icon] ? (
            <span style={{ color: '#2563fc' }}>{IconRegistry[record.icon]}</span>
          ) : record.icon ? (
            <IconByName name={record.icon} style={{ color: '#2563fc' }} />
          ) : null}
          <span style={{
            fontWeight: record.parent_id === 0 ? 600 : 400,
            color: record.menu_type === 'F' ? '#8c8c8c' : '#262626',
          }}>
            {text}
          </span>
          {record.visible === '1' && (
            <Tag style={{ margin: 0, fontSize: 11, lineHeight: '18px' }} color="default">隐藏</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'menu_type',
      key: 'menu_type',
      width: 80,
      align: 'center',
      render: (v) => {
        const cfg = TYPE_CONFIG[v] || { text: v, color: 'default' };
        return <Tag color={cfg.color} style={{ margin: 0, fontSize: 12 }}>{cfg.text}</Tag>;
      },
    },
    {
      title: '排序',
      dataIndex: 'order_num',
      key: 'order_num',
      width: 60,
      align: 'center',
      render: (v) => <Text type="secondary" style={{ fontSize: 13 }}>{v}</Text>,
    },
    // {
    //   title: '权限标识',
    //   dataIndex: 'perms',
    //   key: 'perms',
    //   width: 200,
    //   ellipsis: true,
    //   render: (v) => v
    //     ? <Text code copyable style={{ fontSize: 12 }}>{v}</Text>
    //     : <Text type="secondary" style={{ fontSize: 12 }}>-</Text>,
    // },
    {
      title: '路由路径',
      dataIndex: 'path',
      key: 'path',
      width: 140,
      ellipsis: true,
      render: (v) => v
        ? <Text style={{ fontSize: 12, color: '#595959', fontFamily: 'monospace' }}>{v}</Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>-</Text>,
    },
    {
      title: '组件路径',
      dataIndex: 'component',
      key: 'component',
      width: 160,
      ellipsis: true,
      render: (v) => v
        ? <Text style={{ fontSize: 12, color: '#8c8c8c', fontFamily: 'monospace' }}>{v}</Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>-</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 70,
      align: 'center',
      render: (v) => (
        <Tag color={v === '0' ? 'success' : 'error'} style={{ margin: 0, fontSize: 12 }}>
          {v === '0' ? '正常' : '停用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      align: 'center',
      fixed: 'right',
      render: (_, record) => (
        <Space size={0}>
          {hasPermission('system.menu.edit') && (
            <Tooltip title="修改">
              <Button type="link" size="small" icon={<EditOutlined/>} onClick={() => onEdit(record)}/>
            </Tooltip>
          )}
          {hasPermission('system.menu.add') && record.menu_type !== 'F' && (
            <Tooltip title="新增子菜单">
              <Button type="link" size="small" icon={<PlusOutlined/>} onClick={() => onAdd(record.id)}/>
            </Tooltip>
          )}
          {hasPermission('system.menu.del') && (
            <Tooltip title="删除">
              <Button type="link" size="small" danger icon={<DeleteOutlined/>} onClick={() => onDelete(record)}/>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={menus}
      rowKey="id"
      loading={loading}
      size="small"
      pagination={false}
      expandable={{
        childrenColumnName: 'children',
        expandedRowKeys: expandedKeys,
        onExpandedRowsChange: onExpandedRowsChange,
        defaultExpandAllRows: true,
      }}
      scroll={{ x: 960 }}
    />
  );
}