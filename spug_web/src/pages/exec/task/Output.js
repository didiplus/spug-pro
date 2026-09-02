import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react';
import {
  LoadingOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, CodeOutlined, ClockCircleOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { FitAddon } from 'xterm-addon-fit';
import { Terminal } from 'xterm';
import { Button, Tag, Tooltip, Flex, Typography, Badge } from 'antd';
import style from './index.module.less';
import { http, X_TOKEN } from 'libs';
import store from './store';
import gStore from 'gStore';

const { Text } = Typography;

let gCurrent;

function OutView() {
  const el = useRef()
  const [term] = useState(new Terminal());
  const [fitPlugin] = useState(new FitAddon());
  const [current, setCurrent] = useState(Object.keys(store.outputs)[0])

  useEffect(() => {
    store.tag = ''
    gCurrent = current
    term.options.disableStdin = true
    term.options.fontSize = gStore.terminal.fontSize
    term.options.fontFamily = gStore.terminal.fontFamily
    term.options.theme = { background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#1e1e1e' }
    term.attachCustomKeyEventHandler((arg) => {
      if (arg.ctrlKey && arg.code === 'KeyC' && arg.type === 'keydown') {
        document.execCommand('copy')
        return false
      }
      return true
    })
    term.loadAddon(fitPlugin)
    term.open(el.current)
    fitPlugin.fit()
    term.write('\x1b[36m### WebSocket connecting ...\x1b[0m')
    const resize = () => fitPlugin.fit();
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/subscribe/${store.token}/?x-token=${X_TOKEN}`);
    socket.onopen = () => {
      const message = '\r\x1b[K\x1b[36m### Waiting for scheduling ...\x1b[0m'
      for (let key of Object.keys(store.outputs)) {
        store.outputs[key].data = message
      }
      term.write(message)
      socket.send('ok');
      fitPlugin.fit()
      const formData = fitPlugin.proposeDimensions()
      formData.token = store.token
      http.patch('/api/exec/do/', formData)
    }
    socket.onmessage = e => {
      if (e.data === 'pong') {
        socket.send('ping')
      } else {
        _handleData(e.data)
      }
    }
    socket.onclose = () => {
      for (let key of Object.keys(store.outputs)) {
        if (store.outputs[key].status === -2) {
          store.outputs[key].status = -1
        }
        store.outputs[key].data += '\r\n\x1b[31mWebsocket connection failed!\x1b[0m'
        term.write('\r\n\x1b[31mWebsocket connection failed!\x1b[0m')
      }
    }
    return () => socket && socket.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function _handleData(message) {
    const { key, data, status } = JSON.parse(message);
    if (status !== undefined) {
      store.outputs[key].status = status;
    }
    if (data) {
      store.outputs[key].data += data
      if (String(key) === gCurrent) term.write(data)
    }
  }

  function handleSwitch(key) {
    setCurrent(key)
    gCurrent = key
    term.clear()
    term.write(store.outputs[key].data)
  }

  function openTerminal(key) {
    window.open(`/ssh?id=${key}`)
  }

  const { tag, items, counter } = store
  const total = counter['0'] + counter['1'] + counter['2']
  const currentItem = store.outputs[current]

  return (
    <div className={style.output}>
      <div className={style.side}>
        <Flex align="center" gap={8} style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border-secondary)' }}>

          <Tag color="blue" style={{ marginLeft: 'auto' }}>{total} 台主机</Tag>
        </Flex>

        <Flex gap={8} style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border-secondary)' }}>
          <Tag
            color="processing"
            icon={<ClockCircleOutlined />}
            onClick={() => store.updateTag('0')}
            style={{ cursor: 'pointer', opacity: tag === '' || tag === '0' ? 1 : 0.5, fontWeight: tag === '0' ? 600 : 400 }}
          >
            待执行 {counter['0']}
          </Tag>
          <Tag
            color="success"
            icon={<CheckCircleOutlined />}
            onClick={() => store.updateTag('1')}
            style={{ cursor: 'pointer', opacity: tag === '' || tag === '1' ? 1 : 0.5, fontWeight: tag === '1' ? 600 : 400 }}
          >
            成功 {counter['1']}
          </Tag>
          <Tag
            color="error"
            icon={<ExclamationCircleOutlined />}
            onClick={() => store.updateTag('2')}
            style={{ cursor: 'pointer', opacity: tag === '' || tag === '2' ? 1 : 0.5, fontWeight: tag === '2' ? 600 : 400 }}
          >
            失败 {counter['2']}
          </Tag>
        </Flex>

        <div className={style.list}>
          {items.map(([key, item]) => (
            <div
              key={key}
              className={`${style.hostItem} ${key === current ? style.hostActive : ''}`}
              onClick={() => handleSwitch(key)}
            >
              <Flex align="center" gap={8}>
                {item.status === -2 ? (
                  <LoadingOutlined style={{ color: 'var(--color-primary)' }} />
                ) : item.status === 0 ? (
                  <CheckCircleOutlined style={{ color: 'var(--color-green-600)' }} />
                ) : (
                  <ExclamationCircleOutlined style={{ color: 'var(--color-red-600)' }} />
                )}
                <Text ellipsis style={{ flex: 1, fontSize: 13 }}>{item.title}</Text>
                {key !== current && <RightOutlined style={{ color: 'var(--color-gray-400)', fontSize: 10 }} />}
              </Flex>
            </div>
          ))}
        </div>
      </div>

      <div className={style.body}>
        <Flex align="center" justify="space-between" style={{ marginBottom: 12 }}>
          <Flex align="center" gap={8}>
            {currentItem?.status === -2 ? (
              <Badge status="processing" />
            ) : currentItem?.status === 0 ? (
              <Badge status="success" />
            ) : (
              <Badge status="error" />
            )}
            <Text strong style={{ fontSize: 14 }}>{currentItem?.title}</Text>
          </Flex>
          <Tooltip title="打开终端">
            <Button type="text" icon={<CodeOutlined />} onClick={() => openTerminal(current)} style={{ color: 'var(--color-primary)' }} />
          </Tooltip>
        </Flex>
        <div className={style.termContainer}>
          <div ref={el} className={style.term} />
        </div>
      </div>
    </div>
  )
}

export default observer(OutView)
