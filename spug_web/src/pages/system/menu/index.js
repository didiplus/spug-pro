import React, { useState, useEffect, useMemo } from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Modal, Form, Input, Select, InputNumber, Button, Table, Typography, Tag, Space, Tooltip, Card, Flex, Statistic, Row, Col, Divider } from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  FolderOutlined, MenuOutlined, AppstoreOutlined, ReloadOutlined,
  NodeExpandOutlined, NodeCollapseOutlined, MenuUnfoldOutlined,
} from '@ant-design/icons';
import { http, hasPermission } from 'libs';
import { Breadcrumb, AuthDiv, AuthButton } from 'components';
import { IconRegistry } from '../../../routes';
import { clearCodesCache } from '../role/menuCodes';

const { Text } = Typography;

const ICON_OPTIONS = Object.keys(IconRegistry).map(name => ({ value: name, label: name }));

const TYPE_CONFIG = {
  M: { text: '目录', color: 'processing', icon: <FolderOutlined/> },
  C: { text: '菜单', color: 'success', icon: <MenuOutlined/> },
  F: { text: '按钮', color: 'warning', icon: <AppstoreOutlined/> },
};

function collectKeys(menus, result = []) {
  for (const m of menus) {
    if (m.children && m.children.length > 0) {
      result.push(m.id);
      collectKeys(m.children, result);
    }
  }
  return result;
}

function flattenForOptions(menus, depth = 0, result = []) {
  for (const m of menus) {
    if (m.menu_type !== 'F') {
      result.push({ value: m.id, label: `${'　'.repeat(depth)}${m.menu_name}` });
    }
    if (m.children && m.children.length > 0) {
      flattenForOptions(m.children, depth + 1, result);
    }
  }
  return result;
}

function filterMenus(menus, keyword) {
  if (!keyword) return menus;
  const result = [];
  for (const m of menus) {
    const match = m.menu_name.includes(keyword) || (m.perms && m.perms.includes(keyword));
    const children = m.children ? filterMenus(m.children, keyword) : [];
    if (match || children.length > 0) {
      result.push({ ...m, children });
    }
  }
  return result;
}

function countByType(menus) {
  const counts = { M: 0, C: 0, F: 0 };
  function walk(list) {
    for (const m of list) {
      counts[m.menu_type] = (counts[m.menu_type] || 0) + 1;
      if (m.children) walk(m.children);
    }
  }
  walk(menus);
  return counts;
}

export default observer(function MenuManage() {
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [keyword, setKeyword] = useState('');

  function fetchMenus() {
    setLoading(true);
    http.get('/api/setting/menus/manage/')
      .then(res => {
        setMenus(res);
        setExpandedKeys(collectKeys(res));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchMenus(); }, []);

  function handleAdd(pid) {
    setEditRecord(null);
    form.resetFields();
    form.setFieldsValue({ parent_id: pid || 0, order_num: 0, menu_type: 'C', visible: '0', status: '0', is_frame: 1, is_cache: 0 });
    setFormVisible(true);
  }

  function handleEdit(record) {
    setEditRecord(record);
    form.setFieldsValue(record);
    setFormVisible(true);
  }

  function handleDelete(record) {
    const hasChildren = record.children && record.children.length > 0;
    Modal.confirm({
      title: '删除确认',
      content: hasChildren
        ? `菜单【${record.menu_name}】包含子菜单，删除后将连同所有子菜单一并删除，且不可恢复，确定继续？`
        : `确定要删除菜单【${record.menu_name}】？删除后不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => http.delete('/api/setting/menus/manage/', { params: { id: record.id } })
        .then((res) => {
          if (res && res.deleted_count > 1) {
            message.success(`删除成功，共删除 ${res.deleted_count} 个菜单`);
          } else {
            message.success('删除成功');
          }
          clearCodesCache();
          fetchMenus();
        }),
    });
  }

  function handleSubmit() {
    form.validateFields().then(values => {
      setSubmitting(true);
      const req = editRecord
        ? http.patch('/api/setting/menus/manage/', { ...values, id: editRecord.id })
        : http.post('/api/setting/menus/manage/', values);
      req.then(() => {
        message.success('操作成功');
        clearCodesCache();
        setFormVisible(false);
        fetchMenus();
      }).finally(() => setSubmitting(false));
    });
  }

  const typeCounts = useMemo(() => countByType(menus), [menus]);
  const filteredMenus = filterMenus(menus, keyword);
  const parentOptions = flattenForOptions(menus);
  const allKeys = useMemo(() => collectKeys(menus), [menus]);

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
        const cfg = TYPE_CONFIG[v] || { text: v, color: 'default', icon: null };
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
    {
      title: '权限标识',
      dataIndex: 'perms',
      key: 'perms',
      width: 200,
      ellipsis: true,
      render: (v) => v
        ? <Text code copyable style={{ fontSize: 12 }}>{v}</Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>-</Text>,
    },
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
              <Button type="link" size="small" icon={<EditOutlined/>} onClick={() => handleEdit(record)}/>
            </Tooltip>
          )}
          {hasPermission('system.menu.add') && record.menu_type !== 'F' && (
            <Tooltip title="新增子菜单">
              <Button type="link" size="small" icon={<PlusOutlined/>} onClick={() => handleAdd(record.id)}/>
            </Tooltip>
          )}
          {hasPermission('system.menu.del') && (
            <Tooltip title="删除">
              <Button type="link" size="small" danger icon={<DeleteOutlined/>} onClick={() => handleDelete(record)}/>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <AuthDiv auth="system.menu.view">
      <Breadcrumb items={['首页', '系统管理', '菜单管理']}/>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="目录"
              value={typeCounts.M}
              prefix={<FolderOutlined style={{ color: '#1677ff' }}/>}
              valueStyle={{ color: '#1677ff', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="菜单"
              value={typeCounts.C}
              prefix={<MenuOutlined style={{ color: '#52c41a' }}/>}
              valueStyle={{ color: '#52c41a', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="按钮"
              value={typeCounts.F}
              prefix={<AppstoreOutlined style={{ color: '#faad14' }}/>}
              valueStyle={{ color: '#faad14', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="总计"
              value={typeCounts.M + typeCounts.C + typeCounts.F}
              prefix={<MenuUnfoldOutlined style={{ color: '#722ed1' }}/>}
              valueStyle={{ color: '#722ed1', fontSize: 20 }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
        styles={{ body: { padding: '10px 16px' } }}
      >
        <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
          <Space size={8}>
            <Input
              allowClear
              placeholder="搜索名称或权限标识"
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }}/>}
              style={{ width: 240 }}
              onChange={e => setKeyword(e.target.value)}
            />
            <Button icon={<ReloadOutlined/>} onClick={fetchMenus}>刷新</Button>
            <Button icon={<NodeExpandOutlined/>} onClick={() => setExpandedKeys(allKeys)}>展开</Button>
            <Button icon={<NodeCollapseOutlined/>} onClick={() => setExpandedKeys([])}>折叠</Button>
          </Space>
          {hasPermission('system.menu.add') && (
            <AuthButton auth="system.menu.add" type="primary" icon={<PlusOutlined/>} onClick={() => handleAdd(0)}>新建菜单</AuthButton>
          )}
        </Flex>
      </Card>

      <Table
        columns={columns}
        dataSource={filteredMenus}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={false}
        expandable={{
          childrenColumnName: 'children',
          expandedRowKeys: expandedKeys,
          onExpandedRowsChange: setExpandedKeys,
          defaultExpandAllRows: true,
        }}
        style={{ background: '#fff', borderRadius: 8 }}
        scroll={{ x: 1000 }}
      />

      <Modal
        visible={formVisible}
        width={640}
        maskClosable={false}
        title={editRecord ? '编辑菜单' : '新建菜单'}
        onCancel={() => setFormVisible(false)}
        confirmLoading={submitting}
        onOk={handleSubmit}
      >
        <Form form={form} labelCol={{ span: 6 }} wrapperCol={{ span: 16 }} layout="horizontal">
          <Form.Item name="parent_id" label="父菜单">
            <Select options={[{value: 0, label: '顶级菜单'}, ...parentOptions]} placeholder="选择父菜单"/>
          </Form.Item>
          <Form.Item name="menu_type" label="菜单类型">
            <Select
              options={[
                {value: 'M', label: '目录（M）'},
                {value: 'C', label: '菜单（C）'},
                {value: 'F', label: '按钮（F）'},
              ]}
            />
          </Form.Item>
          <Form.Item name="menu_name" label="菜单名称" rules={[{ required: true, message: '请输入菜单名称' }]}>
            <Input placeholder="如：主机管理"/>
          </Form.Item>
          <Form.Item name="icon" label="菜单图标">
            <Select allowClear placeholder="选择图标" options={ICON_OPTIONS} showSearch/>
          </Form.Item>
          <Form.Item name="order_num" label="显示排序">
            <InputNumber min={0} style={{ width: '100%' }}/>
          </Form.Item>
          <Form.Item name="path" label="路由路径">
            <Input placeholder="如 /host，目录类型可不填"/>
          </Form.Item>
          <Form.Item name="component" label="组件路径">
            <Input placeholder="如 pages/host"/>
          </Form.Item>
          <Form.Item name="perms" label="权限标识">
            <Input placeholder="如 host.host.view，支持 | 表示或关系"/>
          </Form.Item>
          <Form.Item name="visible" label="显示状态">
            <Select options={[{value: '0', label: '显示'}, {value: '1', label: '隐藏'}]}/>
          </Form.Item>
          {editRecord && (
            <Form.Item name="status" label="菜单状态">
              <Select options={[{value: '0', label: '正常'}, {value: '1', label: '停用'}]}/>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </AuthDiv>
  );
});
