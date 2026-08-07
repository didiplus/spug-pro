import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react';
import { FitAddon } from 'xterm-addon-fit';
import { Terminal } from 'xterm';
import { Tag, Typography } from 'antd';
import { X_TOKEN } from 'libs';
import S from './store';
import gStore from 'gStore';

const { Text } = Typography;

function OutputView() {
  const el = useRef();
  const statusRef = useRef('running');
  const hasOutputRef = useRef(false);
  const [term] = useState(new Terminal());
  const [fitPlugin] = useState(new FitAddon());
  const [status, setStatus] = useState('running');


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
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/subscribe/${S.runToken}/?x-token=${X_TOKEN}`);
    socket.onopen = () => {
      term.write('\r\x1b[K');
      socket.send('ok');
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
      socket && socket.close();
      window.removeEventListener('resize', resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
      <div style={{padding: '8px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <Text strong>执行详情</Text>
        <Tag color={status === 'success' ? 'success' : status === 'failed' ? 'error' : 'processing'}>
          {status === 'running' ? '执行中' : status === 'success' ? '成功' : '失败'}
        </Tag>
      </div>
      <div style={{flex: 1, padding: 8, overflow: 'hidden'}}>
        <div ref={el} style={{height: '100%', width: '100%'}}/>
      </div>
    </div>
  );
}

export default observer(OutputView);
