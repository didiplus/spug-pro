/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Card, Input, Select, Space, Tooltip, Spin, Row, Col } from 'antd';
import {
  FrownOutlined, ReloadOutlined, SyncOutlined,
  CheckCircleOutlined, WarningOutlined, FireOutlined,
  PauseCircleOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import store from './store';
import styles from './monitor.module.css';
import { MONITOR_STATUS_MAP } from 'styles/statusPresets';

const STATUS_ICONS = {
  '1': <CheckCircleOutlined/>,
  '2': <WarningOutlined/>,
  '3': <FireOutlined/>,
  '0': <PauseCircleOutlined/>,
  '10': <ClockCircleOutlined/>,
};

function StatusTag({ status, count, active, onClick }) {
  const cfg = MONITOR_STATUS_MAP[status];
  if (!cfg) return null;
  return (
    <span
      onClick={onClick}
      className={`${styles.statusTag} ${active ? styles.statusTagActive : styles.statusTagInactive}`}
      style={{
        border: `1px solid ${cfg.border}`,
        background: active ? cfg.bg : 'var(--color-card)',
        color: cfg.color,
      }}>
      {STATUS_ICONS[status]}
      {cfg.label} {count}
    </span>
  );
}

function MonitorTile({ data }) {
  const cfg = MONITOR_STATUS_MAP[data.status] || MONITOR_STATUS_MAP['0'];
  return (
    <Tooltip
      title={
        <div style={{ lineHeight: 1.8 }}>
          <div><b>{data.name}</b></div>
          <div>分组: {data.group}</div>
          <div>类型: {data.type}</div>
          <div>目标: {data.target}</div>
          <div>状态: {cfg.label}</div>
          <div>更新: {data.latest_run_time || '---'}</div>
          {data.desc && <div>描述: {data.desc}</div>}
        </div>
      }>
      <div
        className={styles.tile}
        style={{ border: `1px solid ${cfg.border}`, background: cfg.bg }}>
        <div className={styles.tileHeader}>
          <span className={styles.tileName}>{data.name}</span>
          <span className={styles.tileIcon} style={{ color: cfg.color }}>{STATUS_ICONS[data.status] || STATUS_ICONS['0']}</span>
        </div>
        <div className={styles.tileFooter}>
          <span className={styles.tileTarget}>{data.target || data.group}</span>
          <span className={styles.tileStatus} style={{ color: cfg.color }}>{cfg.label}</span>
        </div>
      </div>
    </Tooltip>
  );
}

function MonitorCard() {
  const [autoReload, setAutoReload] = useState(false);
  const [status, setStatus] = useState();

  useEffect(() => {
    store.fetchOverviews();
    return () => store.autoReload = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAutoReload() {
    store.autoReload = !autoReload;
    message.info(autoReload ? '关闭自动刷新' : '开启自动刷新');
    if (!autoReload) store.fetchOverviews();
    setAutoReload(!autoReload);
  }

  const allRecords = store.ovDataSource;
  const filteredRecords = status ? allRecords.filter(x => x.status === status) : allRecords;
  const statusCounts = Object.keys(MONITOR_STATUS_MAP).reduce((acc, s) => {
    acc[s] = allRecords.filter(x => x.status === s).length;
    return acc;
  }, {});

  return (
    <Card
      title={<span className={styles.cardTitle}>监控总览</span>}
      className={styles.card}
      styles={{
        header: { borderBottom: '1px solid var(--color-border-secondary)', padding: 'var(--space-4) var(--space-6)' },
        body: { padding: 'var(--space-4) var(--space-6)' },
      }}
      extra={(
        <Space size="middle" wrap>
          <Space size={4}>
            <span className={styles.cardExtra}>分组</span>
            <Select allowClear style={{ minWidth: 130 }} value={store.f_group} onChange={v => store.f_group = v} placeholder="请选择">
              {store.groups.map(item => (
                <Select.Option value={item} key={item}>{item}</Select.Option>
              ))}
            </Select>
          </Space>
          <Space size={4}>
            <span className={styles.cardExtra}>类型</span>
            <Select allowClear style={{ width: 120 }} value={store.f_type} onChange={v => store.f_type = v} placeholder="请选择">
              {store.types.map(item => <Select.Option key={item} value={item}>{item}</Select.Option>)}
            </Select>
          </Space>
          <Space size={4}>
            <span className={styles.cardExtra}>名称</span>
            <Input allowClear style={{ width: 130 }} value={store.f_name} onChange={e => store.f_name = e.target.value} placeholder="请输入"/>
          </Space>
        </Space>
      )}>
      <Spin spinning={store.ovFetching}>
        <div className={styles.toolbar}>
          <Space size={8} wrap>
            {Object.entries(MONITOR_STATUS_MAP).map(([s]) => (
              statusCounts[s] > 0 && (
                <StatusTag
                  key={s}
                  status={s}
                  count={statusCounts[s]}
                  active={status === s}
                  onClick={() => setStatus(status === s ? undefined : s)}
                />
              )
            ))}
          </Space>
          <Tooltip title={autoReload ? '关闭自动刷新' : '开启自动刷新'}>
            <div
              onClick={handleAutoReload}
              className={`${styles.autoReload} ${autoReload ? styles.autoReloadActive : styles.autoReloadIdle}`}>
              {autoReload ? <SyncOutlined spin/> : <ReloadOutlined/>}
            </div>
          </Tooltip>
        </div>
        {filteredRecords.length > 0 ? (
          <Row gutter={[8, 8]}>
            {filteredRecords.map(item => (
              <Col key={item.id} xxl={3} xl={4} lg={6} md={8} sm={12} xs={24}>
                <MonitorTile data={item}/>
              </Col>
            ))}
          </Row>
        ) : (
          <div className={styles.empty}>
            <FrownOutlined style={{ fontSize: 24, marginRight: 8 }}/>
            <span>暂无匹配数据</span>
          </div>
        )}
      </Spin>
    </Card>
  );
}

export default observer(MonitorCard);
