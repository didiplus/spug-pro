import React, { useEffect, useRef, useState } from 'react';
import { FitAddon } from 'xterm-addon-fit';
import { Terminal } from 'xterm';
import { Typography, Button, App } from 'antd';
import { X_TOKEN } from 'libs';
import gStore from 'gStore';
import styles from './terminal-output.module.css';

const { Text } = Typography;

const STATUS_MAP = {
  running: { cls: styles.statusRunning, text: '执行中', dot: true },
  success: { cls: styles.statusSuccess, text: '成功', dot: false },
  failed: { cls: styles.statusFailed, text: '失败', dot: false },
  canceled: { cls: styles.statusFailed, text: '已取消', dot: false },
};

function TerminalOutput({ runToken, title = '执行详情', cancelUrl, onCancel, onStatusChange }) {
  const el = useRef();
  const statusRef = useRef('running');
  const hasOutputRef = useRef(false);
  const [term] = useState(() => new Terminal());
  const [fitPlugin] = useState(() => new FitAddon());
  const [status, setStatus] = useState('running');
  const [canceling, setCanceling] = useState(false);
  const { modal } = App.useApp();

  useEffect(() => {
    term.options.disableStdin = true;
    term.options.fontSize = gStore.terminal.fontSize;
    term.options.fontFamily = gStore.terminal.fontFamily;
    term.options.theme = {background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#1e1e1e'};
    term.loadAddon(fitPlugin);
    term.open(el.current);
    fitPlugin.fit();
    term.write('\x1b[36m### WebSocket connecting ...\x1b[0m');
    const resize = () => fitPlugin.fit();
    window.addEventListener('resize', resize);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/subscribe/${runToken}/?x-token=${X_TOKEN}`);
    socket.onopen = () => {
      term.write('\r\x1b[K');
      socket.send('ok');
      const warnTimer = setTimeout(() => {
        if (!hasOutputRef.current) {
          term.write('\x1b[33m### 等待 worker 处理中，若无输出请检查 runworker 进程是否运行...\x1b[0m\r\n');
        }
      }, 5000);
      socket._warnTimer = warnTimer;
    };
    socket.onmessage = e => {
      if (e.data === 'pong') {
        socket.send('ping');
      } else {
        try {
          const data = JSON.parse(e.data);
          if (data.message) {
            if (!hasOutputRef.current) {
              hasOutputRef.current = true;
              term.write('\r\x1b[K');
            }
            term.write(data.message);
          }
          if (data.status && data.status !== 'running') {
            statusRef.current = data.status;
            setStatus(data.status);
            if (onStatusChange) onStatusChange(data.status);
          }
        } catch {
          if (!hasOutputRef.current) {
            hasOutputRef.current = true;
            term.write('\r\x1b[K');
          }
          term.write(e.data);
        }
      }
    };
    socket.onclose = () => {
      if (statusRef.current === 'running') {
        term.write('\r\n\x1b[31m### WebSocket connection closed\x1b[0m\r\n');
      }
    };

    return () => {
      if (socket._warnTimer) clearTimeout(socket._warnTimer);
      socket && socket.close();
      window.removeEventListener('resize', resize);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken]);

  const cfg = STATUS_MAP[status] || STATUS_MAP.running;

  function handleCancel() {
    modal.confirm({
      title: '取消执行',
      content: '确定要取消当前正在执行的 Playbook 吗？',
      onOk: () => {
        setCanceling(true);
        fetch(cancelUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Token': X_TOKEN,
          },
          body: JSON.stringify({ token: runToken }),
        })
          .then(res => res.json())
          .then(res => {
            if (res.error) {
              term.write(`\r\n\x1b[31m### 取消失败: ${res.error}\x1b[0m\r\n`);
            }
          })
          .catch(() => {})
          .finally(() => setCanceling(false));
      },
    });
  }

  return (
    <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
      <div className={styles.outputHeader}>
        <Text strong>{title}</Text>
        <span className={`${styles.statusTag} ${cfg.cls}`}>
          {cfg.dot && <span className={styles.statusDot} style={{ background: 'currentColor' }}/>}
          {cfg.text}
        </span>
        {status === 'running' && cancelUrl && (
          <Button
            size="small"
            danger
            loading={canceling}
            onClick={handleCancel}
            style={{ marginLeft: 'auto' }}
          >
            取消执行
          </Button>
        )}
      </div>
      <div className={styles.outputBody}>
        <div ref={el} style={{height: '100%', width: '100%'}}/>
      </div>
    </div>
  );
}

export default TerminalOutput;