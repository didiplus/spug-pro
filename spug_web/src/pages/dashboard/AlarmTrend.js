/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useState, useEffect } from 'react';
import { Card, Cascader, Empty } from 'antd';
import { Chart, Geom, Axis, Tooltip } from 'bizcharts';
import { http } from 'libs';
import useChartTheme from './useChartTheme';
import 'styles/tokens.css';
import './tokens.css';

const cardStyle = {
  borderRadius: 'var(--chart-card-radius)',
  boxShadow: 'var(--chart-card-shadow)',
  border: '1px solid var(--chart-card-border)',
  marginBottom: 'var(--space-6)',
};

const cascaderStyle = {
  width: 260,
  borderRadius: 'var(--radius-md)',
};

export default function AlarmTrend() {
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState([]);
  const [params, setParams] = useState({});
  const [res, setRes] = useState([]);
  const theme = useChartTheme();

  useEffect(() => {
    setLoading(true);
    http.get('/api/home/alarm/', { params })
      .then(res => setRes(res))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => {
    const data = {};
    http.get('/api/monitor/')
      .then(res => {
        for (let item of res.detections) {
          if (!data[item.type]) {
            data[item.type] = { value: item.type_alias, label: item.type_alias, children: [] };
          }
          data[item.type].children.push({ value: item.name, label: item.name });
        }
        setOptions(Object.values(data));
      });
  }, []);

  const handleChange = (v) => {
    switch (v.length) {
      case 2:
        setParams({ name: v[1] });
        break;
      case 1:
        setParams({ type: v[0] });
        break;
      default:
        setParams({});
    }
  };

  return (
    <Card
      loading={loading}
      title={<span style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-base)', color: 'var(--chart-card-title-color)' }}>报警趋势</span>}
      extra={
        <Cascader
          changeOnSelect
          style={cascaderStyle}
          options={options}
          onChange={handleChange}
          placeholder="过滤监控项（默认全部）"
          allowClear
        />
      }
      style={cardStyle}
      styles={{
        header: { borderBottom: '1px solid var(--chart-card-header-border)', padding: 'var(--space-4) var(--space-6)' },
        body: { padding: 'var(--space-4) var(--space-6) var(--space-6)' },
      }}
    >
      {res.length === 0 ? (
        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty description="暂无报警数据" />
        </div>
      ) : (
        <Chart
          height={300}
          data={res}
          padding={[20, 20, 40, 50]}
          scale={{ value: { alias: '报警次数', min: 0 } }}
          forceFit
        >
          <Axis
            name="date"
            label={{ fontSize: 12, textAlign: 'center', fill: theme.axis }}
            tickLine={{ lineWidth: 1, stroke: theme.tick }}
          />
          <Axis
            name="value"
            label={{ fontSize: 12, fill: theme.axis }}
            grid={{ lineStyle: { stroke: theme.grid, lineDash: [4, 4] } }}
          />
          <Tooltip
            crosshairs={{ type: 'y' }}
            containerStyle={{
              background: theme.tooltipBg,
              color: theme.tooltipText,
              borderRadius: 'var(--radius-md)',
              boxShadow: theme.tooltipShadow,
            }}
          />
          <Geom
            type="line"
            position="date*value"
            size={2.5}
            shape="smooth"
            color={theme.line}
          />
          <Geom
            type="point"
            position="date*value"
            size={4}
            shape="circle"
            color={theme.line}
            style={{ stroke: theme.tooltipBg, lineWidth: 1 }}
          />
        </Chart>
      )}
    </Card>
  );
}
