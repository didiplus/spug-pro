import React, { useEffect } from 'react';
import { observer } from 'mobx-react';
import { Drawer, Tag } from 'antd';
import S from './store';
import Sider from './Sider';
import Body from './Body';
import css from './index.module.less';

const STATUS_MAP = {
  doing: { color: 'processing', text: '执行中' },
  success: { color: 'success', text: '成功' },
  error: { color: 'error', text: '失败' },
};

function Console() {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  const nodeStatuses = Object.values(S.outputs).map(o => o.status)
  const total = S.nodes.length
  const successCount = nodeStatuses.filter(s => s === 'success').length
  const errorCount = nodeStatuses.filter(s => s === 'error').length
  const doingCount = nodeStatuses.filter(s => s === 'doing').length
  const overall = errorCount > 0 ? 'error' : doingCount > 0 ? 'doing' : successCount === total && total > 0 ? 'success' : 'doing'
  const overallCfg = STATUS_MAP[overall] || STATUS_MAP.doing
  const progress = total > 0 ? Math.round((successCount + errorCount) / total * 100) : 0

  function handleClose() {
    S.token = ''
    S.visible = false
  }

  return (
    <Drawer
      open={!!S.token}
      width="min(92vw, 1600px)"
      footer={null}
      maskClosable={false}
      className={css.console}
      onClose={handleClose}
      styles={{body: {padding: 0}}}
      title={
        <div className={css.header}>
          <span className={css.titleName}>执行控制台</span>
          {S.recordD?.name && <span className={css.pipeName}>{S.recordD.name}</span>}
          <Tag color={overallCfg.color} className={css.statusTag}>{overallCfg.text}</Tag>
        </div>
      }>
      <div className={css.body}>
        <Sider successCount={successCount} errorCount={errorCount} doingCount={doingCount} total={total}/>
        <Body progress={progress} successCount={successCount} errorCount={errorCount} total={total}/>
      </div>
    </Drawer>
  )
}

export default observer(Console)
