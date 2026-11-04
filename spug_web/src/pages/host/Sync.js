/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useState, useEffect } from 'react';
import { Form } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { X_TOKEN } from 'libs';
import styles from './index.module.less';

export default function (props) {
  const [hosts, setHosts] = useState(props.hosts);
  const [error, setError] = useState(null);

  useEffect(() => {
    let index = 0;
    let closed = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/api/ws/host/${props.token}/?x-token=${X_TOKEN}`;

    function connect() {
      const socket = new WebSocket(url);
      socket.onopen = () => socket.send(String(index));
      socket.onmessage = e => {
        if (e.data === 'pong') {
          socket.send(String(index))
        } else {
          index += 1;
          const {key, status, message} = JSON.parse(e.data);
          hosts[key]['status'] = status;
          hosts[key]['message'] = message;
          setHosts({...hosts})
        }
      };
      socket.onerror = () => setError('连接异常');
      socket.onclose = () => {
        if (!closed && index < Object.keys(hosts).length) {
          setError('连接断开，正在重连...');
          setTimeout(connect, 2000);
        }
      };
    }
    connect();
    return () => { closed = true; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Form labelCol={{span: 8}} wrapperCol={{span: 14}} className={styles.batchSync} style={props.style}>
      {error && <Form.Item label=" "><span style={{color: 'var(--color-red-600)'}}>{error}</span></Form.Item>}
      {Object.entries(hosts).map(([key, item]) => (
        <Form.Item key={key} label={item.name} extra={item.message}>
          {item.status === 'ok' && <span style={{color: 'var(--color-green-600)'}}>成功</span>}
          {item.status === 'fail' && <span style={{color: "red"}}>失败</span>}
          {item.status === undefined && <LoadingOutlined/>}
        </Form.Item>
      ))}
    </Form>
  )
}
