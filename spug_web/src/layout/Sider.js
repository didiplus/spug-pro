import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Layout, Menu } from 'antd';
import { history } from 'libs';
import { IconRegistry } from '../routes';
import styles from './layout.module.less';
import logo from './logo-spug-white.png';

function buildMenuItems(menus, openKeysMap) {
  const result = [];
  for (const m of menus) {
    if (m.visible === '1') continue;
    if (m.menu_type === 'F') continue;
    const item = { label: m.menu_name, key: m.path || `group_${m.id}` };
    if (m.icon && IconRegistry[m.icon]) {
      item.icon = IconRegistry[m.icon];
    }
    if (m.children && m.children.length > 0) {
      const children = buildMenuItems(m.children, openKeysMap);
      if (children.length > 0) {
        item.children = children;
        for (const child of children) {
          if (child.key) openKeysMap[child.key] = m.menu_name;
        }
      }
    }
    if (!item.children && !m.path) {
      continue;
    }
    result.push(item);
  }
  return result;
}

export default function Sider(props) {
  const [openKeys, setOpenKeys] = useState([]);
  const [selectedKey, setSelectedKey] = useState(window.location.pathname);
  const collapsedRef = useRef(props.collapsed);

  const openKeysMap = useMemo(() => ({}), []);

  const menuItems = useMemo(() => {
    if (!props.menus || props.menus.length === 0) return [];
    return buildMenuItems(props.menus, openKeysMap);
  }, [props.menus, openKeysMap]);

  useEffect(() => {
    collapsedRef.current = props.collapsed;
  }, [props.collapsed]);

  useEffect(() => {
    const path = window.location.pathname;
    setSelectedKey(path);
    const openKey = openKeysMap[path];
    if (openKey && !collapsedRef.current) {
      setOpenKeys([openKey]);
    }

    const unlisten = history.listen((location) => {
      setSelectedKey(location.pathname);
      const openKey = openKeysMap[location.pathname];
      if (openKey && !collapsedRef.current) {
        setOpenKeys((prev) => prev.includes(openKey) ? prev : [...prev, openKey]);
      }
    });

    return () => unlisten();
  }, [openKeysMap]);

  const handleSelect = ({ key }) => {
    history.push(key);
    setSelectedKey(key);
    const openKey = openKeysMap[key];
    if (openKey) {
      setOpenKeys((prev) => prev.includes(openKey) ? prev : [...prev, openKey]);
    }
  };

  return (
    <Layout.Sider width={208} collapsed={props.collapsed} className={styles.sider}>
      <div className={styles.logo}>
        <img src={logo} alt="Logo" />
      </div>
      <div
        className={styles.menus}
        style={{ height: `${document.body.clientHeight - 64}px` }}
      >
        <Menu
          theme="dark"
          mode="inline"
          items={menuItems}
          className={styles.menus}
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          onSelect={handleSelect}
        />
      </div>
    </Layout.Sider>
  );
}
