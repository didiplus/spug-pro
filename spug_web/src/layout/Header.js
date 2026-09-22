/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Layout, Dropdown, Avatar, Modal } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, UserOutlined, LogoutOutlined, CodeOutlined } from '@ant-design/icons';
import { AuthDiv } from 'components';
import Notification from './Notification';
import styles from './layout.module.less';
import http from '../libs/http';
import history from '../libs/history';
import { clearMenuCache } from '../libs/menu';
import avatar from './avatar.png';

export default function (props) {

  function handleLogout() {
    clearMenuCache();
    history.push('/');
    http.get('/api/account/logout/');
  }

  function confirmLogout() {
    Modal.confirm({
      title: '确认退出',
      content: '确定要退出登录吗？',
      okText: '确认退出',
      cancelText: '取消',
      onOk: handleLogout,
    });
  }

  function openTerminal() {
    window.open('/ssh')
  }

  const userMenuItems = [
    {key: 'info', icon: <UserOutlined style={{marginRight: 8}}/>, label: <Link to="/welcome/info">个人中心</Link>},
    {type: 'divider'},
    {key: 'logout', icon: <LogoutOutlined style={{marginRight: 8}}/>, label: '退出登录', onClick: confirmLogout},
  ];

  return (
    <Layout.Header className={styles.header}>
      <div
        className={styles.trigger}
        onClick={props.toggle}
        role="button"
        aria-label={props.collapsed ? '展开菜单' : '收起菜单'}
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') props.toggle(); }}
      >
        {props.collapsed ? <MenuUnfoldOutlined/> : <MenuFoldOutlined/>}
      </div>
      <div className={styles.right}>
        <Notification/>
        <AuthDiv
          className={styles.terminal}
          auth="host.console.view|host.console.list"
          onClick={openTerminal}
          role="button"
          aria-label="打开终端"
        >
          <CodeOutlined/>
        </AuthDiv>
        <span className={styles.divider} aria-hidden="true"/>
        <div className={styles.user}>
          <Dropdown menu={{items: userMenuItems}}>
            <span className={styles.action} role="button" tabIndex={0} aria-label="用户菜单">
              <Avatar size={24} src={avatar} className={styles.avatar}/>
              <span className={styles.nickname}>{localStorage.getItem('nickname') || '用户'}</span>
            </span>
          </Dropdown>
        </div>
      </div>
    </Layout.Header>
  )
}
