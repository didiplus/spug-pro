import React, { useState, useEffect, useRef } from 'react';
import { Drawer, Row, Col, Card, Spin, Empty, Typography, Button, Space, Select } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { Chart, Geom, Axis, Tooltip, Coord, Legend } from 'bizcharts';
import { http } from 'libs';
import store from './store';

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
      visible
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
              <Card size="small" title={panel.title} bodyStyle={{padding: 12}}>
                <Spin spinning={loading[panel.id]}>
                  <div style={{height: panel.height, overflow: 'auto'}}>
                    <PanelRenderer panel={panel} data={panelData[panel.id]}/>
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

function PanelRenderer({panel, data}) {
  if (!data) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="等待数据..."/>;
  if (data.status === 'error') return <Text type="danger">{data.error || '查询失败'}</Text>;

  const result = data?.data?.result || [];
  if (result.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无数据"/>;

  switch (panel.panel_type) {
    case 'timeseries':
      return <TimeSeriesChart result={result} unit={panel.unit}/>;
    case 'stat':
      return <StatPanel result={result} unit={panel.unit}/>;
    case 'gauge':
      return <GaugePanel result={result} unit={panel.unit}/>;
    case 'bar':
      return <BarChart result={result} unit={panel.unit}/>;
    case 'table':
      return <TablePanel result={result}/>;
    default:
      return <TimeSeriesChart result={result} unit={panel.unit}/>;
  }
}

function TimeSeriesChart({result, unit}) {
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
    <Chart height={280} data={data} autoFit>
      <Legend position="top"/>
      <Axis name="time"/>
      <Axis name="value" label={{formatter: v => v + (unit || '')}}/>
      <Tooltip showCrosshairs/>
      <Geom type="line" position="time*value" color="label" shape="smooth" size={2}/>
    </Chart>
  );
}

function StatPanel({result, unit}) {
  const val = result[0]?.value?.[1] || '0';
  const num = parseFloat(val);
  return (
    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>
      <Text style={{fontSize: 48, fontWeight: 600}}>
        {Number.isInteger(num) ? num : num.toFixed(2)}{unit || ''}
      </Text>
    </div>
  );
}

function GaugePanel({result, unit}) {
  const val = parseFloat(result[0]?.value?.[1] || '0');
  const data = [{value: val}];
  return (
    <Chart height={280} data={data} autoFit>
      <Coord type="polar" radius={0.8} startAngle={Math.PI} endAngle={2 * Math.PI}/>
      <Axis name="value" visible={false}/>
      <Geom type="interval" position="value*1" color="#1890ff" size={20}/>
      <Tooltip/>
    </Chart>
  );
}

function BarChart({result, unit}) {
  const data = [];
  for (const series of result) {
    const labels = series.metric || {};
    const label = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(', ') || 'value';
    const lastVal = series.values?.[series.values.length - 1]?.[1] || '0';
    data.push({label, value: parseFloat(lastVal)});
  }
  return (
    <Chart height={280} data={data} autoFit>
      <Axis name="label"/>
      <Axis name="value" label={{formatter: v => v + (unit || '')}}/>
      <Geom type="interval" position="label*value" color="#1890ff"/>
    </Chart>
  );
}

function TablePanel({result}) {
  const rows = result.map((r, i) => ({
    key: i,
    metric: Object.entries(r.metric || {}).map(([k, v]) => `${k}=${v}`).join(', '),
    value: r.value?.[1] || '-',
  }));
  return (
    <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 13}}>
      <thead>
        <tr style={{borderBottom: '1px solid var(--color-border-secondary)'}}>
          <th style={{textAlign: 'left', padding: '8px 4px'}}>指标</th>
          <th style={{textAlign: 'right', padding: '8px 4px'}}>值</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key} style={{borderBottom: '1px solid var(--color-border-secondary)'}}>
            <td style={{padding: '8px 4px'}}><Text ellipsis style={{maxWidth: 400}}>{r.metric}</Text></td>
            <td style={{textAlign: 'right', padding: '8px 4px'}}><Text code>{r.value}</Text></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}