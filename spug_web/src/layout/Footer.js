/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import { Layout } from 'antd';
import { CopyrightOutlined, GithubOutlined, HomeOutlined, FileTextOutlined } from '@ant-design/icons';
import styles from './layout.module.less';

const LINKS = [
  { icon: <HomeOutlined/>, label: '官网', href: 'https://spug.cc' },
  { icon: <GithubOutlined/>, label: 'GitHub', href: 'https://github.com/openspug/spug' },
  { icon: <FileTextOutlined/>, label: '文档', href: 'https://ops.spug.cc/docs/about-spug/' },
];

export default function () {
  return (
    <Layout.Footer style={{padding: 0}}>
      <div className={styles.footer}>
        <div className={styles.footerLeft}>
          <CopyrightOutlined className={styles.footerIcon}/>
          <span>{new Date().getFullYear()} OpenSpug</span>
          <span className={styles.footerDivider}>·</span>
          <span className={styles.footerLicense}>AGPL-3.0</span>
        </div>
        <div className={styles.footerLinks}>
          {LINKS.map((link, i) => (
            <React.Fragment key={link.href}>
              {i > 0 && <span className={styles.footerSep}/>}
              <a
                className={styles.footerLink}
                title={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer">
                {link.icon}
                <span>{link.label}</span>
              </a>
            </React.Fragment>
          ))}
        </div>
      </div>
    </Layout.Footer>
  )
}
