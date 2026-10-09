import React, { useEffect, useState, useRef } from 'react';
import { observer } from 'mobx-react';
import { Card, Collapse, Steps, Skeleton, Tag, Space, Typography, Button } from 'antd';
import { ShrinkOutlined, LoadingOutlined, CloseOutlined, RollbackOutlined } from '@ant-design/icons';
import { FitAddon } from 'xterm-addon-fit';
import { Terminal } from 'xterm';
import { AuthDiv, Breadcrumb } from 'components';
import { http, X_TOKEN, history } from 'libs';
import style from './index.module.less';

const { Text } = Typography;

const STATUS_MAP = {
  '-3': { color: 'error', text: '发布异常' },
  '0': { color: 'default', text: '待执行' },
  '1': { color: 'processing', text: '执行中' },
  '3': { color: 'success', text: '成功' },
  '4': { color: 'warning', text: '灰度成功' },
};

function OutView(props) {
  const el = useRef();

  useEffect(() => {
    setTimeout(() => {
      const fitPlugin = new FitAddon();
      const term = new Terminal({ disableStdin: true });
      term.setOption('fontFamily', 'Source Code Pro, Courier New, Courier, Monaco, monospace, PingFang SC, Microsoft YaHei');
      term.loadAddon(fitPlugin);
      term.setOption('theme', { background: '#fff', foreground: '#000', selection: '#999' });
      term.attachCustomKeyEventHandler((arg) => {
        if (arg.ctrlKey && arg.code === 'KeyC' && arg.type === 'keydown') {
          document.execCommand('copy');
          return false;
        }
        return true;
      });
      term.open(el.current);
      fitPlugin.fit();
      props.setTerm(term);
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: '8px 0 0 15px' }}>
      <div ref={el} style={{ height: 300 }} />
    </div>
  );
}

function RunDetail(props) {
  const runId = parseInt(props.match.params.id);
  const [run, setRun] = useState(null);
  const [sActions, setSActions] = useState([]);
  const [hActions, setHActions] = useState([]);
  const [outputs, setOutputs] = useState({});
  const [fetching, setFetching] = useState(true);
  const [visible, setVisible] = useState(true);
  const [mini, setMini] = useState(false);
  const termsRef = useRef({});
  const socketRef = useRef(null);

  useEffect(() => {
    fetchDetail();
    return () => {
      if (socketRef.current) socketRef.current.close();
    };
  }, []);

  function fetchDetail() {
    http.get(`/api/pipeline/runs/${runId}/`).then(res => {
      setRun(res.run);
      setSActions(res.s_actions || []);
      setHActions(res.h_actions || []);
      setOutputs(res.outputs || {});
      setFetching(false);
      if (res.run.status === '1' && res.log_channel) {
        connectWebSocket(res.log_channel);
      }
    });
  }

  function connectWebSocket(channel) {
    if (socketRef.current) socketRef.current.close();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/subscribe/${channel}/?x-token=${X_TOKEN}`);
    socketRef.current = socket;
    socket.onopen = () => socket.send('ok');
    socket.onmessage = e => {
      if (e.data === 'pong') {
        socket.send('ping');
      } else {
        try {
          const msg = JSON.parse(e.data);
          handleSocketMessage(msg);
        } catch {
        }
      }
    };
    socket.onclose = () => {
    };
  }

  function handleSocketMessage(msg) {
    const { key, data, status } = msg;
    setOutputs(prev => {
      const item = prev[key];
      if (!item) return prev;
      const newItem = { ...item };
      if (data !== undefined) {
        newItem.data = (item.data || '') + data;
        if (termsRef.current[key]) {
          termsRef.current[key].write(data);
        }
      }
      if (status !== undefined) {
        newItem.status = status;
      }
      return { ...prev, [key]: newItem };
    });
    if (status === 'success' || status === 'error') {
      setTimeout(fetchDetail, 500);
    }
  }

  function handleSetTerm(term, key) {
    if (outputs[key] && outputs[key].data) {
      term.write(outputs[key].data);
    }
    termsRef.current[key] = term;
  }

  function switchMiniMode() {
    setMini(true);
    setVisible(false);
  }

  if (!run) return null;

  const statusCfg = STATUS_MAP[run.status] || { color: 'default', text: run.status };
  const hostOutputs = Object.values(outputs).filter(x => x.id !== 'local');
  const localOutput = outputs['local'];

  function StepItem({ step: currentStep, item, step, ...rest }) {
    let icon = null;
    if (currentStep === step && item.status !== 'error' && item.status !== 'success') {
      icon = <LoadingOutlined />;
    }
    return <Steps.Step {...rest} icon={icon} />;
  }

  return (
    <AuthDiv auth="pipeline.pipeline.view|pipeline.pipeline.run">
      <Breadcrumb items={['首页', '流水线', '执行详情']} />
      <div className={style.container}>
        <Card className={style.header}>
          <Space>
            <Text strong style={{ fontSize: 16 }}>{run.pipeline_name}</Text>
            <Tag color={statusCfg.color}>{statusCfg.text}</Tag>
            <Text type="secondary">触发: {run.trigger_user_name || '-'}</Text>
            <Text type="secondary">开始: {run.started_at || '-'}</Text>
            {run.error_message && <Text type="danger">{run.error_message}</Text>}
          </Space>
          <Button icon={<RollbackOutlined />} onClick={() => history.push('/pipeline/list')}>返回列表</Button>
        </Card>

        {mini && (
          <Card className={style.miniCard} onClick={() => setVisible(true)}>
            <div className={style.miniHeader}>
              <div className={style.miniTitle}>{run.pipeline_name}</div>
              <CloseOutlined onClick={() => setMini(false)} />
            </div>
          </Card>
        )}

        <Card
          open={visible}
          className={style.consoleCard}
          title={
            <Space>
              <Text strong>{run.pipeline_name}</Text>
              <Tag color={statusCfg.color}>{statusCfg.text}</Tag>
              <ShrinkOutlined onClick={switchMiniMode} style={{ cursor: 'pointer' }} />
            </Space>
          }
        >
          <Skeleton loading={fetching} active>
            {localOutput && sActions.length > 0 && (
              <Collapse defaultActiveKey={['local']} className={style.collapse}>
                <Collapse.Panel header={
                  <div className={style.panelHeader}>
                    <b className={style.panelTitle}>本地执行</b>
                    <Steps size="small" current={localOutput.step || 0} status={localOutput.status} className={style.steps}>
                      {sActions.map((item, index) => (
                        <StepItem key={index} title={item.title} item={localOutput} step={index} />
                      ))}
                    </Steps>
                  </div>
                }>
                  <OutView setTerm={term => handleSetTerm(term, 'local')} />
                </Collapse.Panel>
              </Collapse>
            )}

            {hostOutputs.length > 0 && (
              <Collapse
                accordion
                defaultActiveKey="0"
                className={style.collapse}
                style={{ marginTop: localOutput ? 24 : 0 }}
              >
                {hostOutputs.map((item, index) => (
                  <Collapse.Panel
                    key={index}
                    header={
                      <div className={style.panelHeader}>
                        <b className={style.panelTitle}>{item.title}</b>
                        <Steps size="small" current={item.step || 0} status={item.status} className={style.steps}>
                          {hActions.map((action, aIndex) => (
                            <StepItem key={aIndex} title={action.title} item={item} step={aIndex} />
                          ))}
                        </Steps>
                      </div>
                    }>
                    <OutView setTerm={term => handleSetTerm(term, item.id)} />
                  </Collapse.Panel>
                ))}
              </Collapse>
            )}
          </Skeleton>
        </Card>
      </div>
    </AuthDiv>
  );
}

export default observer(RunDetail);
