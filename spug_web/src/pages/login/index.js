/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useState, useEffect } from 'react';
import { message } from 'libs/message';
import { Form, Input, Button, Tabs, Modal } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  CopyrightOutlined,
  GithubOutlined,
  MailOutlined,
  BellOutlined,
  CalendarOutlined,
  SettingOutlined,
  BarChartOutlined,
  DesktopOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  MoonOutlined,
} from '@ant-design/icons';
import styles from './login.module.css';
import 'styles/tokens.css';
import './tokens.css';
import history from 'libs/history';
import { http, updatePermissions } from 'libs';
import { getTheme, toggleTheme } from 'libs/theme';
import logo from 'layout/logo-spug.png';
import envStore from 'pages/config/environment/store';
import appStore from 'pages/config/app/store';
import requestStore from 'pages/deploy/request/store';
import execStore from 'pages/exec/task/store';
import hostStore from 'pages/host/store';


export default function () {
  const [form] = Form.useForm();
  const [counter, setCounter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loginType, setLoginType] = useState(localStorage.getItem('login_type') || 'default');
  const [codeVisible, setCodeVisible] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [isDark, setIsDark] = useState(getTheme() === 'dark');
  const [hoveredServer, setHoveredServer] = useState(null);

  useEffect(() => {
    const handler = (e) => setIsDark((e.detail || getTheme()) === 'dark');
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
  }, []);

  useEffect(() => {
    envStore.records = [];
    appStore.records = [];
    requestStore.records = [];
    requestStore.deploys = [];
    hostStore.rawRecords = [];
    execStore.hosts = [];
  }, [])

  useEffect(() => {
    setTimeout(() => {
      if (counter > 0) {
        setCounter(counter - 1)
      }
    }, 1000)
  }, [counter])

  function handleSubmit() {
    const formData = form.getFieldsValue();
    if (codeVisible && !formData.captcha) return message.error('请输入验证码');
    setLoading(true);
    formData['type'] = loginType;
    http.post('/api/account/login/', formData)
      .then(data => {
        if (data['required_mfa']) {
          setCodeVisible(true);
          setCounter(30);
          setLoading(false)
        } else if (!data['has_real_ip']) {
          Modal.warning({
            title: '安全警告',
            className: styles.tips,
            content: <div>
              未能获取到访问者的真实IP，无法提供基于请求来源IP的合法性验证，详细信息请参考
              <a target="_blank"
                href="https://ops.spug.cc/docs/practice/"
                rel="noopener noreferrer">官方文档</a>。
            </div>,
            onOk: () => doLogin(data)
          })
        } else {
          doLogin(data)
        }
      }, () => setLoading(false))
  }

  function doLogin(data) {
    localStorage.setItem('id', data['id']);
    localStorage.setItem('token', data['access_token']);
    localStorage.setItem('nickname', data['nickname']);
    localStorage.setItem('is_supper', data['is_supper']);
    localStorage.setItem('permissions', JSON.stringify(data['permissions']));
    localStorage.setItem('login_type', loginType);
    updatePermissions();
    if (history.location.state && history.location.state['from']) {
      history.push(history.location.state['from'])
    } else {
      history.push('/home')
    }
  }

  function handleCaptcha() {
    setCodeLoading(true);
    const formData = form.getFieldsValue(['username', 'password']);
    formData['type'] = loginType;
    http.post('/api/account/login/', formData)
      .then(() => setCounter(30))
      .finally(() => setCodeLoading(false))
  }

  return (
    <div className={styles.container}>
      <button
        className={styles.themeToggle}
        onClick={() => toggleTheme()}
        aria-label={isDark ? '切换亮色模式' : '切换暗色模式'}
      >
        {isDark ? <BulbOutlined/> : <MoonOutlined/>}
      </button>
      <aside className={styles.brand}>
        <div className={styles.brandGrid} />
        <div className={styles.brandOrb1} />
        <div className={styles.brandOrb2} />
        <div className={styles.brandContent}>
          <div className={styles.brandHeading}>
            <div className={styles.brandBadge}>OPEN SOURCE</div>
            <div className={styles.brandTitle}>Spug Pro</div>
          </div>
          <div className={styles.brandSubtitle}>轻量级自动化运维平台</div>
          <div className={styles.brandDesc}>SSH 原生无 Agent，开箱即用的全栈自动化运维平台</div>
          <div className={styles.archDiagram}>
            <div className={styles.archIcons}>
              <div className={styles.archIconWrap}><BellOutlined className={styles.archIconItem} /></div>
              <div className={styles.archIconWrap}><CalendarOutlined className={styles.archIconItem} /></div>
              <div className={styles.archIconWrap}><SettingOutlined className={styles.archIconItem} /></div>
              <div className={styles.archIconWrap}><BarChartOutlined className={styles.archIconItem} /></div>
            </div>
            <div className={styles.terminal}>
              <div className={styles.termTitlebar}>
                <span className={styles.termDot} />
                <span className={styles.termDot} />
                <span className={styles.termDot} />
                <span className={styles.termBatch}><ThunderboltOutlined /> batch</span>
                <span className={styles.termSpug}>spug  pro</span>
              </div>
              <div className={styles.termBody}>
                <div className={styles.termSidebar}>
                  <div className={styles.termSidebarLine} />
                  <div className={styles.termSidebarLine} />
                  <div className={styles.termSidebarLine} />
                  <div className={styles.termSidebarLineShort} />
                </div>
                <div className={styles.termMain}>
                  <div className={styles.termCmd}>$ spug exec -g web uptime<span className={styles.termCursor} /></div>
                  <div className={`${styles.termResult} ${hoveredServer === 0 ? styles.termResultActive : ''}`}>
                     <span className={styles.serverStatus} />
                    <span className={styles.termIp}>10.0.1.11</span>
                    <span className={styles.termLoad}>· load 0.42</span>
                  </div>
                  <div className={`${styles.termResult} ${hoveredServer === 1 ? styles.termResultActive : ''}`}>
                   <span className={styles.serverStatus} />
                    <span className={styles.termIp}>10.0.1.12</span>
                    <span className={styles.termLoad}>· load 0.38</span>
                  </div>
                  <div className={`${styles.termResult} ${hoveredServer === 2 ? styles.termResultActive : ''}`}>
                    <span className={styles.serverStatus} />
                    <span className={styles.termIp}>10.0.2.31</span>
                    <span className={styles.termLoad}>· load 0.51</span>
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.archArrow}>
              <span className={styles.archArrowLine} />
              <span className={styles.archArrowFlow} />
            </div>
            <div className={styles.sshTag}><LockOutlined /> SSH :22 · no agent</div>
            <div className={`${styles.archArrow} ${styles.archArrowDelayed}`}>
              <span className={styles.archArrowLine} />
              <span className={styles.archArrowFlow} />
            </div>
            <div className={styles.serverNodes}>
              <div className={styles.serverConnectLine} />
              <div
                className={styles.serverNode}
                onMouseEnter={() => setHoveredServer(0)}
                onMouseLeave={() => setHoveredServer(null)}
              >
                <DesktopOutlined className={styles.serverIcon} />
                <span className={styles.serverStatus} />
                <span className={styles.serverIp}>10.0.1.11</span>
              </div>
              <div
                className={styles.serverNode}
                onMouseEnter={() => setHoveredServer(1)}
                onMouseLeave={() => setHoveredServer(null)}
              >
                <DesktopOutlined className={styles.serverIcon} />
                <span className={styles.serverStatus} />
                <span className={styles.serverIp}>10.0.1.12</span>
              </div>
              <div
                className={styles.serverNode}
                onMouseEnter={() => setHoveredServer(2)}
                onMouseLeave={() => setHoveredServer(null)}
              >
                <DesktopOutlined className={styles.serverIcon} />
                <span className={styles.serverStatus} />
                <span className={styles.serverIp}>10.0.2.31</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <main className={styles.card} aria-labelledby="login-title">
          <div className={styles.header}>
            <img className={styles.logo} src={logo} alt="Spug Pro 运维平台" />
            <div id="login-title" className={styles.title}>Spug Pro 运维平台</div>
            <div className={styles.desc}>灵活、强大、易用的开源运维平台</div>
          </div>

          <Tabs
            activeKey={loginType}
            className={styles.tabs}
            onTabClick={v => setLoginType(v)}
            items={[
              { key: 'default', label: '普通登录' },
              { key: 'ldap', label: 'LDAP登录' },
            ]}
          />

          <Form form={form} onFinish={handleSubmit} requiredMark={false}>
            <Form.Item name="username" className={styles.formItem}>
              <Input
                size="large"
                autoComplete="username"
                placeholder="请输入账户"
                aria-label="账户"
                prefix={<UserOutlined className={styles.icon} />}
              />
            </Form.Item>
            <Form.Item name="password" className={styles.formItem}>
              <Input.Password
                size="large"
                autoComplete="current-password"
                placeholder="请输入密码"
                aria-label="密码"
                prefix={<LockOutlined className={styles.icon} />}
                onPressEnter={handleSubmit}
              />
            </Form.Item>
            {codeVisible && (
              <Form.Item name="captcha" className={styles.formItem}>
                <div className={styles.captchaWrapper}>
                  <Form.Item noStyle name="captcha">
                    <Input
                      size="large"
                      autoComplete="one-time-code"
                      placeholder="请输入验证码"
                      aria-label="验证码"
                      prefix={<MailOutlined className={styles.icon} />}
                    />
                  </Form.Item>
                  {counter > 0 ? (
                    <Button disabled size="large" className={styles.captchaBtn}>
                      {counter} 秒后重新获取
                    </Button>
                  ) : (
                    <Button
                      size="large"
                      loading={codeLoading}
                      className={styles.captchaBtn}
                      onClick={handleCaptcha}
                    >
                      获取验证码
                    </Button>
                  )}
                </div>
              </Form.Item>
            )}
            <Form.Item className={styles.submitItem}>
              <Button
                block
                size="large"
                type="primary"
                htmlType="submit"
                className={styles.button}
                loading={loading}
              >
                登录
              </Button>
            </Form.Item>
          </Form>
        </main>

        <footer className={styles.footer}>
          <div className={styles.footerLinks}>
            <a href="https://spug.cc" target="_blank" rel="noopener noreferrer">官网</a>
            <span className={styles.footerDivider} />
            <a href="https://github.com/openspug/spug" target="_blank" rel="noopener noreferrer" aria-label="GitHub 仓库">
              <GithubOutlined />
            </a>
            <span className={styles.footerDivider} />
            <a href="https://ops.spug.cc/docs/about-spug/" target="_blank" rel="noopener noreferrer">文档</a>
          </div>
          <div className={styles.footerCopyright}>
            <CopyrightOutlined /> {new Date().getFullYear()} OpenSpug
          </div>
        </footer>
      </div>
    </div>
  );
}