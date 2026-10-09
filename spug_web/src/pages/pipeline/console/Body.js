import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react';
import { Tag, Progress, Tooltip, Empty } from 'antd';
import { CopyOutlined, FullscreenOutlined, FullscreenExitOutlined, CheckOutlined } from '@ant-design/icons';
import Icon from '../Icon';
import Term from 'components/Term';
import { t } from 'libs';
import S from './store';
import css from './body.module.less';

const STATUS_MAP = {
  doing: { color: 'processing', text: '执行中' },
  success: { color: 'success', text: '成功' },
  error: { color: 'error', text: '失败' },
};

function Body(props) {
  const termRef = useRef()
  const [wsConnected, setWsConnected] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!S.node?.id) return
    const term = termRef.current
    if (!term) return
    term.clear()
    const output = S.outputs[String(S.node.id)]
    if (output?.data) {
      term.write(output.data)
    }
    term.scrollToBottom()
    setTimeout(() => term.fit(), 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S.node?.id])

  useEffect(() => {
    if (!S.token || S.readonly) return
    setWsConnected(false)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const channel = `spug:pipeline:log:${S.token}`
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/subscribe/${channel}/?x-token=${localStorage.getItem('token')}`)

    socket.onopen = () => {
      setWsConnected(true)
      socket.send('ok')
    }
    socket.onmessage = e => {
      if (e.data === 'pong') {
        socket.send('ping')
      } else {
        try {
          const msg = JSON.parse(e.data)
          const { key, data, status } = msg
          if (S.outputs[key]) {
            if (data !== undefined) {
              S.outputs[key].data = (S.outputs[key].data || '') + data
              if (String(S.node?.id) === key) {
                const term = termRef.current
                if (term) {
                  term.write(data)
                  term.scrollToBottom()
                }
              }
            }
            if (status !== undefined) {
              S.outputs[key].status = status
            }
          }
        } catch {
        }
      }
    }
    socket.onclose = () => setWsConnected(false)
    return () => socket.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S.token])

  function handleCopy() {
    const output = S.outputs[String(S.node?.id)]
    if (output?.data && navigator.clipboard) {
      navigator.clipboard.writeText(output.data)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  function handleFullscreen() {
    setFullscreen(!fullscreen)
    setTimeout(() => termRef.current?.fit(), 100)
  }

  const currentNode = S.node
  const currentOutput = currentNode ? S.outputs[String(currentNode.id)] : null
  const statusCfg = STATUS_MAP[currentOutput?.status] || null
  const hasOutput = currentOutput?.data && currentOutput.data.length > 20

  return (
    <div className={`${css.container} ${fullscreen ? css.fullscreen : ''}`}>
      <div className={css.header}>
        <div className={css.headerLeft}>
          {currentNode ? (
            <>
              <div className={css.nodeIcon}>
                <Icon size={20} module={currentNode.module}/>
              </div>
              <span className={css.title}>{currentNode.name || t('未命名')}</span>
              <Tag color={statusCfg?.color} className={css.statusTag}>{statusCfg?.text || t('等待')}</Tag>
            </>
          ) : (
            <span className={css.title}>{t('选择节点查看输出')}</span>
          )}
        </div>
        <div className={css.headerRight}>
          <div className={`${css.wsStatus} ${wsConnected ? css.wsConnected : ''}`}>
            <span className={`${css.dot} ${wsConnected ? css.online : css.offline}`}/>
            <span className={wsConnected ? css.wsOnline : css.wsOffline}>
              {wsConnected ? t('已连接') : t('未连接')}
            </span>
          </div>
          <Tooltip title={copied ? t('已复制') : t('复制日志')}>
            <div className={css.toolBtn} onClick={handleCopy}>
              {copied ? <CheckOutlined style={{color: 'var(--color-green-500)'}}/> : <CopyOutlined/>}
            </div>
          </Tooltip>
          <Tooltip title={fullscreen ? t('退出全屏') : t('全屏')}>
            <div className={css.toolBtn} onClick={handleFullscreen}>
              {fullscreen ? <FullscreenExitOutlined/> : <FullscreenOutlined/>}
            </div>
          </Tooltip>
        </div>
      </div>
      <div className={css.termWrap}>
        <Term ref={termRef}/>
        {!hasOutput && (
          <div className={css.emptyOverlay}>
            <Empty description={t('暂无输出')} image={Empty.PRESENTED_IMAGE_SIMPLE}/>
          </div>
        )}
      </div>
      <div className={css.footer}>
        <span className={css.footerLabel}>{t('执行进度')}</span>
        <Progress
          percent={props.progress}
          size="small"
          showInfo={false}
          strokeColor={{from: 'var(--color-primary)', to: 'var(--color-green-500)'}}
          style={{flex: 1, margin: 0}}
        />
        <span className={css.progressText}>
          {props.successCount + props.errorCount}/{props.total}
        </span>
      </div>
    </div>
  )
}

export default observer(Body)
