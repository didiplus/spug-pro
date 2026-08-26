import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { Avatar, Tabs, Spin } from 'antd';
import {
  UserOutlined, MobileOutlined, MailOutlined, ApartmentOutlined,
} from '@ant-design/icons';
import { Breadcrumb } from 'components';
import Basic from './Basic';
import Reset from './Reset';
import OperationLog from './OperationLog';
import store from './store';
import styles from './index.module.css';

function Index() {
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    store.fetchUser();
  }, []);

  const user = store.user || {};

  const infoItems = [
    { icon: <UserOutlined/>, label: '登录账号', value: user.username },
    { icon: <UserOutlined/>, label: '用户昵称', value: user.nickname },
    { icon: <ApartmentOutlined/>, label: '所属部门', value: user.department || '-' },
    { icon: <MobileOutlined/>, label: '手机号码', value: user.phone || '-' },
    { icon: <MailOutlined/>, label: '用户邮箱', value: user.email || '-' },
  ];

  return (
    <div>
      <Breadcrumb items={['首页', '个人中心']}/>
      <Spin spinning={store.fetching}>
        <div className={styles.container}>
          <div className={styles.sidebar}>
            <div className={styles.sidebarTitle}>个人信息</div>
            <div className={styles.avatarWrap}>
              <Avatar size={80} icon={<UserOutlined/>}/>
            </div>
            <div className={styles.infoList}>
              {infoItems.map((item, idx) => (
                <div className={styles.infoItem} key={idx}>
                  <span className={styles.infoIcon}>{item.icon}</span>
                  <span className={styles.infoLabel}>{item.label}</span>
                  <span className={styles.infoValue}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.main}>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={[
                { key: 'profile', label: '用户资料', children: <Basic/> },
                { key: 'security', label: '安全设置', children: <Reset/> },
                { key: 'logs', label: '操作日志', children: <OperationLog/> },
              ]}
            />
          </div>
        </div>
      </Spin>
    </div>
  );
}

export default observer(Index);
