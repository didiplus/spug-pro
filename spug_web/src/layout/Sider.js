import React, { useState, useEffect, useRef } from 'react';
import { Layout, Menu } from 'antd';
import { hasPermission, history } from 'libs';
import styles from './layout.module.less';
import routes from '../routes';
import logo from './logo-spug-white.png';

// 预计算路径对应的父级菜单标题（用于展开）
const OpenKeysMap = {};
for (let item of routes) {
  if (item.child) {
    for (let sub of item.child) {
      if (sub.title) OpenKeysMap[sub.path] = item.title;
    }
  } else if (item.title) {
    OpenKeysMap[item.path] = 1; // 顶层菜单无需展开
  }
}

export default function Sider(props) {
  const [openKeys, setOpenKeys] = useState([]);
  const [menus, setMenus] = useState([]);
  const [selectedKey, setSelectedKey] = useState(window.location.pathname);
  const collapsedRef = useRef(props.collapsed);

  // 同步 collapsed 的最新值到 ref
  useEffect(() => {
    collapsedRef.current = props.collapsed;
  }, [props.collapsed]);

  // 初始化菜单、选中项和展开项，并监听路由变化
  useEffect(() => {
    // 递归处理路由项（定义在 effect 内部，避免依赖外部函数）
    function handleRoute(item) {
      if (item.auth && !hasPermission(item.auth)) return null;
      if (!item.title) return null;

      const menu = { label: item.title, key: item.path, icon: item.icon };

      if (item.child) {
        menu.children = [];
        for (let sub of item.child) {
          const subMenu = handleRoute(sub);
          if (subMenu) menu.children.push(subMenu);
        }
        if (menu.children.length === 0) return null; // 无有效子菜单则忽略
      }

      return menu;
    }

    // 构建菜单树
    const result = [];
    for (let item of routes) {
      const menu = handleRoute(item);
      if (menu) result.push(menu);
    }
    setMenus(result);

    // 初始化选中和展开
    const path = window.location.pathname;
    setSelectedKey(path);
    const openKey = OpenKeysMap[path];
    if (openKey && openKey !== 1 && !collapsedRef.current) {
      setOpenKeys([openKey]);
    }

    // 监听路由变化（浏览器前进/后退）
    const unlisten = history.listen((location) => {
      setSelectedKey(location.pathname);
      const openKey = OpenKeysMap[location.pathname];
      if (openKey && openKey !== 1 && !collapsedRef.current) {
        setOpenKeys((prev) => {
          if (!prev.includes(openKey)) {
            return [...prev, openKey];
          }
          return prev;
        });
      }
    });

    return () => {
      unlisten(); // 清理路由监听
    };
    // 空依赖数组，因为所有依赖（如 routes、hasPermission）在组件生命周期内不会变化
    // 如果未来有变化，可考虑添加依赖，但目前保持不变
  }, []);

  // 菜单选择事件
  const handleSelect = ({ key }) => {
    history.push(key);
    setSelectedKey(key);
    const openKey = OpenKeysMap[key];
    if (openKey && openKey !== 1) {
      setOpenKeys((prev) => {
        if (!prev.includes(openKey)) {
          return [...prev, openKey];
        }
        return prev;
      });
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
          items={menus}
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