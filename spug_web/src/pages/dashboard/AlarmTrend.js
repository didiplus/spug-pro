/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useState, useEffect } from 'react';
import { Card, Cascader, Empty } from 'antd';
import { Chart, Geom, Axis, Tooltip } from 'bizcharts';
import { http } from 'libs';

const cardStyle = {
  borderRadius: 12,
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
  border: '1px solid #f0f0f0',
  marginBottom: 24,
};

const cascaderStyle = {
  width: 260,
  borderRadius: 6,
};

const chartConfig = {
  padding: [20, 20, 40, 50],
  forceFit: true,
};

export default function AlarmTrend() {
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState([]);
  const [params, setParams] = useState({});
  const [res, setRes] = useState([]);

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
      title={<span style={{ fontWeight: 500, fontSize: 16, color: '#262626' }}>报警趋势</span>}
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
        header: { borderBottom: '1px solid #f0f0f0', padding: '16px 24px' },
        body: { padding: '16px 24px 24px' },
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
          padding={chartConfig.padding}
          scale={{ value: { alias: '报警次数', min: 0 } }}
          forceFit={chartConfig.forceFit}
        >
          <Axis
            name="date"
            label={{ fontSize: 12, textAlign: 'center' }}
            tickLine={{ lineWidth: 1, stroke: '#e8e8e8' }}
          />
          <Axis
            name="value"
            label={{ fontSize: 12 }}
            grid={{ lineStyle: { stroke: '#f0f0f0', lineDash: [4, 4] } }}
          />
          <Tooltip
            crosshairs={{ type: 'y' }}
            containerStyle={{
              background: 'rgba(255,255,255,0.95)',
              borderRadius: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          />
          <Geom
            type="line"
            position="date*value"
            size={2.5}
            shape="smooth"
            color="#1890ff"
          />
          <Geom
            type="point"
            position="date*value"
            size={4}
            shape="circle"
            color="#1890ff"
            style={{ stroke: '#fff', lineWidth: 1 }}
          />
        </Chart>
      )}
    </Card>
  );
}