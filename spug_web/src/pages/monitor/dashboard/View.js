import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Drawer, Row, Col, Card, Spin, Empty, Typography, Button, Space, Select, Table } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { Chart, Geom, Axis, Tooltip, Legend } from 'bizcharts';
import { http } from 'libs';
import store from './store';
import useChartTheme from '../../dashboard/useChartTheme';

const { Text } = Typography;

const REFRESH_OPTIONS = [
  {value: 10, label: '10s'},
  {value: 30, label: '30s'},
  {value: 60, label: '1m'},
  {value: 300, label: '5m'},
];

export default function DashboardView() {
  const dashboard = store.viewDashboard;
  const [refresh, setRefresh] = useState(dashboard?.refresh || 30);
  const [panelData, setPanelData] = useState({});
  const [loading, setLoading] = useState({});
  const timerRef = useRef(null);
  const theme = useChartTheme();

  useEffect(() => {
    if (dashboard) {
      setRefresh(dashboard.refresh);
      fetchAllPanels();
      timerRef.current = setInterval(fetchAllPanels, (dashboard.refresh || 30) * 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard?.id]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (dashboard) {
      timerRef.current = setInterval(fetchAllPanels, refresh * 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  function fetchAllPanels() {
    if (!dashboard?.panels) return;
    const now = Math.floor(Date.now() / 1000);
    const start = now - 3600;
    dashboard.panels.forEach(panel => {
      setLoading(prev => ({...prev, [panel.id]: true}));
      http.post('/api/monitor/dashboard/query/', {
        datasource_url: dashboard.datasource_url,
        query: panel.query,
        start: panel.panel_type === 'timeseries' || panel.panel_type === 'bar' ? start : undefined,
        end: panel.panel_type === 'timeseries' || panel.panel_type === 'bar' ? now : undefined,
        step: 30,
      }).then(res => {
        setPanelData(prev => ({...prev, [panel.id]: res}));
      }).catch(() => {}).finally(() => {
        setLoading(prev => ({...prev, [panel.id]: false}));
      });
    });
  }

  if (!dashboard) return null;

  return (
    <Drawer
      open
      width="100%"
      title={
        <Space>
          <Text strong>{dashboard.name}</Text>
          <Text type="secondary" style={{fontSize: 13}}>{dashboard.desc}</Text>
        </Space>
      }
      extra={
        <Space>
          <Select value={refresh} options={REFRESH_OPTIONS} onChange={v => setRefresh(v)} style={{width: 80}}/>
          <Button icon={<ReloadOutlined/>} onClick={fetchAllPanels}>刷新</Button>
        </Space>
      }
      onClose={store.closeView}
      destroyOnClose>
      {dashboard.panels?.length === 0 ? (
        <Empty description="暂无面板" style={{marginTop: 80}}/>
      ) : (
        <Row gutter={[12, 12]}>
          {dashboard.panels.map(panel => (
            <Col key={panel.id} span={24} lg={panel.col_span}>
              <Card size="small" title={panel.title} styles={{body: {padding: 12}}}>
                <Spin spinning={loading[panel.id]}>
                  <div style={{height: panel.height, overflow: 'auto'}}>
                    <PanelRenderer panel={panel} data={panelData[panel.id]} theme={theme}/>
                  </div>
                </Spin>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Drawer>
  );
}

function PanelRenderer({panel, data, theme}) {
  if (!data) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="等待数据..."/>;
  if (data.status === 'error') return <Text type="danger">{data.error || '查询失败'}</Text>;

  const result = data?.data?.result || [];
  if (result.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无数据"/>;

  switch (panel.panel_type) {
    case 'timeseries':
      return <TimeSeriesChart result={result} unit={panel.unit} theme={theme}/>;
    case 'line':
      return <LineChartPanel result={result} unit={panel.unit} theme={theme}/>;
    case 'stat':
      return <StatPanel result={result} unit={panel.unit}/>;
    case 'gauge':
      return <GaugePanel result={result} unit={panel.unit} theme={theme}/>;
    case 'liquid':
      return <LiquidPanel result={result} unit={panel.unit} theme={theme}/>;
    case 'bar':
      return <BarChart result={result} unit={panel.unit} theme={theme}/>;
    case 'table':
      return <TablePanel result={result}/>;
    default:
      return <TimeSeriesChart result={result} unit={panel.unit} theme={theme}/>;
  }
}

function TimeSeriesChart({result, unit, theme}) {
  const data = [];
  for (const series of result) {
    const labels = series.metric || {};
    const label = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(', ') || 'value';
    for (const [ts, val] of series.values || []) {
      data.push({time: new Date(ts * 1000), value: parseFloat(val), label});
    }
  }
  if (data.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}/>;
  return (
    <Chart height={280} data={data} forceFit padding={[20, 20, 40, 50]}>
      <Legend position="top" textStyle={{fontSize: 11, fill: theme.axis}}/>
      <Axis name="time" label={{fontSize: 11, fill: theme.axis, autoRotate: true}} tickLine={{stroke: theme.tick, lineWidth: 1}} line={{stroke: theme.tick}}/>
      <Axis name="value" label={{fontSize: 11, fill: theme.axis, formatter: v => v + (unit || '')}} grid={{lineStyle: {stroke: theme.grid, lineDash: [4, 4]}}}/>
      <Tooltip showCrosshairs containerStyle={{background: theme.tooltipBg, color: theme.tooltipText, borderRadius: '6px', boxShadow: theme.tooltipShadow}}/>
      <Geom type="line" position="time*value" color="label" shape="smooth" size={2}/>
    </Chart>
  );
}

function StatPanel({result, unit}) {
  const val = result[0]?.value?.[1] || '0';
  const num = parseFloat(val);
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)', padding: '16px'}}>
      <Text style={{fontSize: 48, fontWeight: 700, color: 'var(--color-primary)', lineHeight: 1.2}}>
        {Number.isInteger(num) ? num : num.toFixed(2)}
      </Text>
      {unit && <Text style={{fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 6}}>{unit}</Text>}
    </div>
  );
}

function GaugePanel({result, unit, theme}) {
  const val = parseFloat(result[0]?.value?.[1] || '0');
  const max = 100;
  const percent = Math.min(Math.max(val / max, 0), 1);
  const radius = 80;
  const circumference = Math.PI * radius;
  const dashLength = circumference * percent;
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%'}}>
      <svg width="200" height="130" viewBox="0 0 200 130">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={theme.line}/>
            <stop offset="100%" stopColor="var(--color-green-500)"/>
          </linearGradient>
        </defs>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--color-border-secondary)" strokeWidth="10" strokeLinecap="round"/>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#gaugeGrad)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${dashLength} ${circumference}`}/>
        <text x="20" y="118" fill="var(--color-text-tertiary)" fontSize="10" textAnchor="middle">0</text>
        <text x="100" y="118" fill="var(--color-text-tertiary)" fontSize="10" textAnchor="middle">{max / 2}</text>
        <text x="180" y="118" fill="var(--color-text-tertiary)" fontSize="10" textAnchor="middle">{max}</text>
      </svg>
      <div style={{marginTop: -18, textAlign: 'center'}}>
        <Text style={{fontSize: 32, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1}}>
          {Number.isInteger(val) ? val : val.toFixed(2)}
        </Text>
        {unit && <Text style={{fontSize: 13, color: 'var(--color-text-secondary)', marginLeft: 4}}>{unit}</Text>}
      </div>
    </div>
  );
}

function LiquidPanel({result, unit, theme}) {
  const val = parseFloat(result[0]?.value?.[1] || '0');
  const max = 100;
  const percent = Math.min(Math.max(val / max, 0), 1);
  const waterY = 180 - 160 * percent;
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const w1 = `M -60 ${waterY} C -40 ${waterY - 12}, -20 ${waterY - 12}, 0 ${waterY} S 40 ${waterY + 12}, 60 ${waterY} S 100 ${waterY - 12}, 120 ${waterY} S 160 ${waterY + 12}, 180 ${waterY} S 220 ${waterY - 12}, 240 ${waterY} S 280 ${waterY + 12}, 300 ${waterY} L 300 200 L -60 200 Z`;
  const w2 = `M -60 ${waterY + 4} C -40 ${waterY - 7}, -20 ${waterY - 7}, 0 ${waterY + 4} S 40 ${waterY + 15}, 60 ${waterY + 4} S 100 ${waterY - 7}, 120 ${waterY + 4} S 160 ${waterY + 15}, 180 ${waterY + 4} S 220 ${waterY - 7}, 240 ${waterY + 4} S 280 ${waterY + 15}, 300 ${waterY + 4} L 300 200 L -60 200 Z`;
  return (
    <div style={{position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>
      <svg width="180" height="180" viewBox="0 0 200 200">
        <defs>
          <clipPath id={`clip-${uid}`}>
            <circle cx="100" cy="100" r="74"/>
          </clipPath>
          <linearGradient id={`grad-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={theme.line} stopOpacity="0.45"/>
            <stop offset="100%" stopColor={theme.line} stopOpacity="0.1"/>
          </linearGradient>
          <linearGradient id={`ring-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={theme.line} stopOpacity="0.6"/>
            <stop offset="100%" stopColor="var(--color-border-secondary)" stopOpacity="0.3"/>
          </linearGradient>
          <linearGradient id={`shine-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.15"/>
            <stop offset="60%" stopColor="#fff" stopOpacity="0"/>
          </linearGradient>
        </defs>
        <style>{`
          @keyframes wave1-${uid} { from { transform: translateX(0); } to { transform: translateX(-60px); } }
          @keyframes wave2-${uid} { from { transform: translateX(-60px); } to { transform: translateX(0); } }
          @keyframes bub1-${uid} { 0% { transform: translateY(0); opacity: 0; } 30% { opacity: 0.6; } 100% { transform: translateY(-50px); opacity: 0; } }
          @keyframes bub2-${uid} { 0% { transform: translateY(0); opacity: 0; } 30% { opacity: 0.4; } 100% { transform: translateY(-60px); opacity: 0; } }
          @keyframes bub3-${uid} { 0% { transform: translateY(0); opacity: 0; } 30% { opacity: 0.5; } 100% { transform: translateY(-45px); opacity: 0; } }
        `}</style>
        <circle cx="100" cy="100" r="78" fill="none" stroke={theme.line} strokeWidth="1" opacity="0.15"/>
        <circle cx="100" cy="100" r="74" fill="var(--color-bg-secondary)"/>
        <g clipPath={`url(#clip-${uid})`}>
          <rect x="20" y={waterY + 14} width="160" height="160" fill={`url(#grad-${uid})`}/>
          <path d={w1} fill={theme.line} opacity="0.4" style={{animation: `wave1-${uid} 3s linear infinite`}}/>
          <path d={w2} fill={theme.line} opacity="0.2" style={{animation: `wave2-${uid} 2.5s linear infinite`}}/>
          <line x1="28" y1={waterY} x2="172" y2={waterY} stroke="#fff" strokeWidth="1" opacity="0.2"/>
          {percent > 0.1 && (
            <>
              <circle cx="72" cy={waterY + 40} r="3" fill="#fff" opacity="0.5" style={{animation: `bub1-${uid} 3s ease-in-out infinite`}}/>
              <circle cx="128" cy={waterY + 50} r="2.5" fill="#fff" opacity="0.4" style={{animation: `bub2-${uid} 4s ease-in-out 0.8s infinite`}}/>
              <circle cx="100" cy={waterY + 60} r="2" fill="#fff" opacity="0.35" style={{animation: `bub3-${uid} 3.5s ease-in-out 1.5s infinite`}}/>
            </>
          )}
          <ellipse cx="100" cy="40" rx="50" ry="20" fill={`url(#shine-${uid})`}/>
        </g>
        <circle cx="100" cy="100" r="74" fill="none" stroke={`url(#ring-${uid})`} strokeWidth="2.5"/>
      </svg>
      <div style={{position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center'}}>
        <Text style={{fontSize: 36, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1, letterSpacing: '-0.02em'}}>
          {Number.isInteger(val) ? val : val.toFixed(2)}
        </Text>
        <div style={{fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4, fontWeight: 500}}>
          {unit || '%'}
        </div>
      </div>
    </div>
  );
}

function LineChartPanel({result, unit, theme}) {
  const colors = [theme.line, 'var(--color-green-500)', 'var(--color-gold-500)', 'var(--color-purple-500)', 'var(--color-red-500)'];
  const series = result.map(s => {
    const label = Object.entries(s.metric || {}).map(([k, v]) => `${k}="${v}"`).join(', ') || 'value';
    const points = (s.values || []).map(([ts, val]) => ({ts: parseFloat(ts), val: parseFloat(val)}));
    return {label, points};
  });
  const allPoints = series.flatMap(s => s.points);
  if (allPoints.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}/>;
  const minTs = Math.min(...allPoints.map(p => p.ts));
  const maxTs = Math.max(...allPoints.map(p => p.ts));
  const minVal = Math.min(...allPoints.map(p => p.val));
  const maxVal = Math.max(...allPoints.map(p => p.val));
  const W = 400, H = 280, pad = {top: 24, right: 16, bottom: 36, left: 48};
  const cw = W - pad.left - pad.right, ch = H - pad.top - pad.bottom;
  const xS = ts => pad.left + (ts - minTs) / (maxTs - minTs || 1) * cw;
  const yS = val => pad.top + ch - (val - minVal) / (maxVal - minVal || 1) * ch;
  const yTicks = 4, xTicks = 5;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {Array.from({length: yTicks + 1}, (_, i) => {
        const y = pad.top + (ch / yTicks) * i;
        const val = maxVal - (maxVal - minVal) * (i / yTicks);
        return <g key={`y${i}`}>
          <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke={theme.grid} strokeWidth="1" strokeDasharray="4 4"/>
          <text x={pad.left - 6} y={y + 3} fill={theme.axis} fontSize="10" textAnchor="end">{val.toFixed(1)}{unit || ''}</text>
        </g>;
      })}
      {Array.from({length: xTicks + 1}, (_, i) => {
        const x = pad.left + (cw / xTicks) * i;
        const ts = minTs + (maxTs - minTs) * (i / xTicks);
        const time = new Date(ts * 1000).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
        return <g key={`x${i}`}>
          <line x1={x} y1={pad.top} x2={x} y2={pad.top + ch} stroke={theme.grid} strokeWidth="1" strokeDasharray="4 4"/>
          <text x={x} y={H - pad.bottom + 14} fill={theme.axis} fontSize="10" textAnchor="middle">{time}</text>
        </g>;
      })}
      {series.map((s, i) => {
        if (s.points.length === 0) return null;
        const color = colors[i % colors.length];
        const path = s.points.map((p, j) => `${j === 0 ? 'M' : 'L'} ${xS(p.ts).toFixed(1)} ${yS(p.val).toFixed(1)}`).join(' ');
        const area = path + ` L ${xS(s.points[s.points.length - 1].ts).toFixed(1)} ${pad.top + ch} L ${xS(s.points[0].ts).toFixed(1)} ${pad.top + ch} Z`;
        return <g key={i}>
          <path d={area} fill={color} opacity="0.08"/>
          <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        </g>;
      })}
      {series.slice(0, 5).map((s, i) => {
        const color = colors[i % colors.length];
        const x = pad.left + i * 76;
        return <g key={`l${i}`}>
          <line x1={x} y1={10} x2={x + 10} y2={10} stroke={color} strokeWidth="2"/>
          <text x={x + 14} y={13} fill={theme.axis} fontSize="10">{s.label.length > 10 ? s.label.slice(0, 10) + '…' : s.label}</text>
        </g>;
      })}
    </svg>
  );
}

function BarChart({result, unit, theme}) {
  const data = [];
  for (const series of result) {
    const labels = series.metric || {};
    const label = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(', ') || 'value';
    const lastVal = series.values?.[series.values.length - 1]?.[1] || '0';
    data.push({label, value: parseFloat(lastVal)});
  }
  return (
    <Chart height={280} data={data} forceFit padding={[20, 20, 40, 50]}>
      <Axis name="label" label={{fontSize: 11, fill: theme.axis, autoRotate: true}} tickLine={{stroke: theme.tick, lineWidth: 1}} line={{stroke: theme.tick}}/>
      <Axis name="value" label={{fontSize: 11, fill: theme.axis, formatter: v => v + (unit || '')}} grid={{lineStyle: {stroke: theme.grid, lineDash: [4, 4]}}}/>
      <Tooltip containerStyle={{background: theme.tooltipBg, color: theme.tooltipText, borderRadius: '6px', boxShadow: theme.tooltipShadow}}/>
      <Geom type="interval" position="label*value" color={theme.line}/>
    </Chart>
  );
}

function TablePanel({result}) {
  const columns = [
    {title: '指标', dataIndex: 'metric', ellipsis: true, width: '70%'},
    {title: '值', dataIndex: 'value', align: 'right', render: v => <Text code>{v}</Text>},
  ];
  const rows = result.map((r, i) => ({
    key: i,
    metric: Object.entries(r.metric || {}).map(([k, v]) => `${k}=${v}`).join(', '),
    value: r.value?.[1] || '-',
  }));
  return <Table columns={columns} dataSource={rows} size="small" pagination={false} scroll={{y: 240}}/>;
}