import React from 'react';
import styles from './index.module.less';

export default function NotFound() {
  return (
    <div className={styles.notFound}>
      <div className={styles.notFoundImg}/>
      <h1 className={styles.notFoundTitle}>404</h1>
      <div className={styles.notFoundDesc}>抱歉，你访问的页面不存在</div>
    </div>
  )
}