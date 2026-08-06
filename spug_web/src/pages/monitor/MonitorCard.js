/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Card, Input, Select, Space, Tooltip, Spin, Tag, Row, Col } from 'antd';
import {
  FrownOutlined, ReloadOutlined, SyncOutlined,
  CheckCircleOutlined, WarningOutlined, FireOutlined,
  PauseCircleOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import store from './store';

const STATUS_CONFIG = {
  '1': { label: '正常', color: '#52c41a', bg: '#f6ffed', border: '#b7eb8f', icon: <CheckCircleOutlined/> },
  '2': { label: '警告', color: '#faad14', bg: '#fffbe6', border: '#ffe58f', icon: <WarningOutlined/> },
  '3': { label: '紧急', color: '#ff4d4f', bg: '#fff2f0', border: '#ffccc7', icon: <FireOutlined/> },
  '0': { label: '未激活', color: '#8c8c8c', bg: '#fafafa', border: '#d9d9d9', icon: <PauseCircleOutlined/> },
  '10': { label: '待调度', color: '#1677ff', bg: '#f0f5ff', border: '#adc6ff', icon: <ClockCircleOutlined/> },
};

const cardStyle = {
  borderRadius: 8,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: '1px solid #f0f0f0',
  marginBottom: 24,
};

function StatusTag({ status, count, active, onClick }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <Tag
      icon={cfg.icon}
      onClick={onClick}
      style={{
        cursor: 'pointer',
        margin: 0,
        padding: '4px 12px',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        opacity: active ? 1 : 0.65,
        borderRadius: 6,
        border: `1px solid ${cfg.border}`,
        background: active ? cfg.bg : '#fff',
        color: cfg.color,
        userSelect: 'none',
        transition: 'all 0.2s ease',
      }}>
      {cfg.label} {count}
    </Tag>
  );
}

function MonitorTile({ data }) {
  const cfg = STATUS_CONFIG[data.status] || STATUS_CONFIG['0'];
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
        style={{

          borderRadius: 6,
          border: `1px solid ${cfg.border}`,
          background: cfg.bg,
          padding: '8px 12px',
          cursor: 'default',
          transition: 'all 0.2s ease',
          overflow: 'hidden',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.transform = 'translateY(0)';
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#262626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
            {data.name}
          </span>
          <span style={{ color: cfg.color, fontSize: 14, flexShrink: 0 }}>{cfg.icon}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: '#8c8c8c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
            {data.target || data.group}
          </span>
          <span style={{ fontSize: 11, color: cfg.color, fontWeight: 500, flexShrink: 0 }}>{cfg.label}</span>
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
  const statusCounts = Object.keys(STATUS_CONFIG).reduce((acc, s) => {
    acc[s] = allRecords.filter(x => x.status === s).length;
    return acc;
  }, {});

  return (
    <Card
      title={<span style={{ fontWeight: 500, fontSize: 16, color: '#262626' }}>监控总览</span>}
      style={cardStyle}
      styles={{
        header: { borderBottom: '1px solid #f0f0f0', padding: '16px 24px' },
        body: { padding: '16px 24px' },
      }}
      extra={(
        <Space size="middle" wrap>
          <Space size={4}>
            <span style={{ color: '#8c8c8c', fontSize: 13 }}>分组</span>
            <Select allowClear style={{ minWidth: 130 }} value={store.f_group} onChange={v => store.f_group = v} placeholder="请选择">
              {store.groups.map(item => (
                <Select.Option value={item} key={item}>{item}</Select.Option>
              ))}
            </Select>
          </Space>
          <Space size={4}>
            <span style={{ color: '#8c8c8c', fontSize: 13 }}>类型</span>
            <Select allowClear style={{ width: 120 }} value={store.f_type} onChange={v => store.f_type = v} placeholder="请选择">
              {store.types.map(item => <Select.Option key={item} value={item}>{item}</Select.Option>)}
            </Select>
          </Space>
          <Space size={4}>
            <span style={{ color: '#8c8c8c', fontSize: 13 }}>名称</span>
            <Input allowClear style={{ width: 130 }} value={store.f_name} onChange={e => store.f_name = e.target.value} placeholder="请输入"/>
          </Space>
        </Space>
      )}>
      <Spin spinning={store.ovFetching}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Space size={8} wrap>
            {Object.entries(STATUS_CONFIG).map(([s]) => (
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
              style={{
                cursor: 'pointer',
                fontSize: 18,
                color: autoReload ? '#2563fc' : '#8c8c8c',
                padding: 4,
                borderRadius: 6,
                transition: 'color 0.2s ease',
              }}>
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
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#999', padding: '32px 0' }}>
            <FrownOutlined style={{ fontSize: 24, marginRight: 8 }}/>
            <span>暂无匹配数据</span>
          </div>
        )}
      </Spin>
    </Card>
  );
}

export default observer(MonitorCard);
