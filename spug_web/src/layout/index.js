/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useState, useEffect } from 'react';
import { Switch, Route } from 'react-router-dom';
import { message } from 'libs/message';
import {Layout} from 'antd';
import { NotFound } from 'components';
import Sider from './Sider';
import Header from './Header';
import Footer from './Footer'
import { ComponentRegistry } from '../routes';
import { fetchMenus } from '../libs/menu';
import { isMobile } from 'libs';
import styles from './layout.module.less';

function flattenMenus(menus, result = []) {
  for (const m of menus) {
    if (m.path && m.component) {
      result.push(m);
    }
    if (m.children) {
      flattenMenus(m.children, result);
    }
  }
  return result;
}

const BUILTIN_ROUTES = [
  {path: '/welcome/info', component: 'pages/welcome/info'},
];

export default function () {
  const [collapsed, setCollapsed] = useState(false)
  const [Routes, setRoutes] = useState([]);
  const [menus, setMenus] = useState([]);

  useEffect(() => {
    if (isMobile) {
      setCollapsed(true);
      message.warn('检测到您在移动设备上访问，请使用横屏模式。', 5)
    }
    fetchMenus().then(menuTree => {
      setMenus(menuTree);
      const flat = flattenMenus(menuTree);
      const menuRoutes = flat.map(m => {
        const Comp = ComponentRegistry[m.component];
        if (!Comp) return null;
        return <Route exact key={m.path} path={m.path} component={Comp}/>;
      }).filter(Boolean);
      const builtinRoutes = BUILTIN_ROUTES.map(r => {
        const Comp = ComponentRegistry[r.component];
        if (!Comp) return null;
        return <Route exact key={r.path} path={r.path} component={Comp}/>;
      }).filter(Boolean);
      setRoutes([...builtinRoutes, ...menuRoutes]);
    });
  }, [])

  return (
    <Layout>
      <Sider collapsed={collapsed} menus={menus}/>
      <Layout style={{height: '100vh'}}>
        <Header collapsed={collapsed} toggle={() => setCollapsed(!collapsed)}/>
        <Layout.Content className={styles.content} id="spug-container">
          <Switch>
            {Routes}
            <Route component={NotFound}/>
          </Switch>
        </Layout.Content>
        <Footer/>
      </Layout>
    </Layout>
  )
}
