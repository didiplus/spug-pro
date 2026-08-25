import React from 'react';
import { Tag } from 'antd';
import { FolderOutlined, MenuOutlined, AppstoreOutlined } from '@ant-design/icons';

export const TYPE_CONFIG = {
  M: { text: '目录', color: 'processing', icon: <FolderOutlined/> },
  C: { text: '菜单', color: 'success', icon: <MenuOutlined/> },
  F: { text: '按钮', color: 'warning', icon: <AppstoreOutlined/> },
};

export function collectKeys(menus, result = []) {
  for (const m of menus) {
    if (m.children && m.children.length > 0) {
      result.push(m.id);
      collectKeys(m.children, result);
    }
  }
  return result;
}

export function flattenForOptions(menus, depth = 0, result = []) {
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

export function filterMenus(menus, keyword) {
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

export function countByType(menus) {
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