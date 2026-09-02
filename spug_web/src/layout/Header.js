/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Layout, Dropdown, Avatar, Divider, Modal } from 'antd';  // 新增 Modal
import { MenuFoldOutlined, MenuUnfoldOutlined, UserOutlined, LogoutOutlined, CodeOutlined, DownOutlined } from '@ant-design/icons';
import { AuthDiv } from 'components';
import Notification from './Notification';
import styles from './layout.module.less';
import http from '../libs/http';
import history from '../libs/history';
import { clearMenuCache } from '../libs/menu';
import avatar from './avatar.png';

export default function (props) {

  // 实际退出登录逻辑
  function handleLogout() {
    clearMenuCache();
    history.push('/');
    http.get('/api/account/logout/');
  }

  // 确认退出弹窗
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
    {key: 'info', icon: <UserOutlined style={{marginRight: 10}}/>, label: <Link to="/welcome/info">个人中心</Link>},
    {type: 'divider'},
    {key: 'logout', icon: <LogoutOutlined style={{marginRight: 10}}/>, label: '退出登录', onClick: confirmLogout},
  ];

  const toolsMenuItems = [
    {key: 'ssl', label: '免费证书', onClick: () => window.open('https://ssl.spug.cc')},
    {key: 'up', label: '免费监控', onClick: () => window.open('https://up.spug.cc')},
    {key: 'push', label: '推送助手', onClick: () => window.open('https://push.spug.cc')},
  ];

  return (
    <Layout.Header className={styles.header}>
      <div className={styles.trigger} onClick={props.toggle}>
        {props.collapsed ? <MenuUnfoldOutlined/> : <MenuFoldOutlined/>}
      </div>
      <div className={styles.right}>
        {/* <div className={styles.link} onClick={() => window.open('https://spug.cc/')}>官网</div>
        <div className={styles.link} onClick={() => window.open('https://ops.spug.cc/docs/about-spug/')}>文档</div>
        <Dropdown menu={{items: toolsMenuItems}} placement="bottom">
          <span className={styles.link}>
            工具服务 <DownOutlined style={{fontSize: 12}}/>
          </span>
        </Dropdown> */}
        {/* <Divider type="vertical"/> */}
        <Notification/>
        <AuthDiv className={styles.terminal} auth="host.console.view|host.console.list" onClick={openTerminal}>
          <CodeOutlined style={{fontSize: 16}}/>
        </AuthDiv>
        <div className={styles.user}>
          <Dropdown menu={{items: userMenuItems}} style={{background: '#000'}}>
            <span className={styles.action}>
              <Avatar size="small" src={avatar} style={{marginRight: 8}}/>
              {localStorage.getItem('nickname')}
            </span>
          </Dropdown>
        </div>
      </div>
    </Layout.Header>
  )
}