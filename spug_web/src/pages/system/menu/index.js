import React, { useState, useEffect, useMemo } from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Modal, Input, Button, Card, Flex, Space } from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined,
  NodeExpandOutlined, NodeCollapseOutlined,
} from '@ant-design/icons';
import { http, hasPermission } from 'libs';
import { Breadcrumb, AuthDiv, AuthButton } from 'components';
import { clearCodesCache } from '../role/menuCodes';
import MenuForm from './MenuForm';
import MenuTable from './MenuTable';
import { collectKeys, flattenForOptions, filterMenus } from './utils';

export default observer(function MenuManage() {
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [parentId, setParentId] = useState(0);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [keyword, setKeyword] = useState('');

  function fetchMenus() {
    setLoading(true);
    http.get('/api/setting/menus/manage/')
      .then(res => {
        setMenus(res);

      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchMenus(); }, []);

  function handleAdd(pid) {
    setEditRecord(null);
    setParentId(pid || 0);
    setFormVisible(true);
  }

  function handleEdit(record) {
    setEditRecord(record);
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

  function handleFormClose() {
    setFormVisible(false);
    setEditRecord(null);
  }

  function handleFormSuccess() {
    handleFormClose();
    fetchMenus();
  }

  const filteredMenus = filterMenus(menus, keyword);
  const parentOptions = flattenForOptions(menus);
  const allKeys = useMemo(() => collectKeys(menus), [menus]);

  return (
    <AuthDiv auth="system.menu.view">
      <Breadcrumb items={['首页', '系统管理', '菜单管理']}/>

      <Card
        size="small"
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: '12px 16px' } }}
      >
        <Flex justify="space-between" align="center" wrap="wrap" gap={8} style={{ marginBottom: 12 }}>
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

        <MenuTable
          menus={filteredMenus}
          loading={loading}
          expandedKeys={expandedKeys}
          onExpandedRowsChange={setExpandedKeys}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </Card>

      <MenuForm
        visible={formVisible}
        editRecord={editRecord}
        parentId={parentId}
        parentOptions={parentOptions}
        onCancel={handleFormClose}
        onSuccess={handleFormSuccess}
      />
    </AuthDiv>
  );
});
