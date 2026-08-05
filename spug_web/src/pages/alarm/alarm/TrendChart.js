/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import { observer } from 'mobx-react';
import { Card, Empty, Statistic, Row, Col, Table, Tag, Select } from 'antd';
import { Chart, Geom, Axis, Tooltip, Legend } from 'bizcharts';
import store from './store';

function formatDuration(seconds) {
  if (!seconds) return '-';
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
  return `${(seconds / 3600).toFixed(1)}小时`;
}

export default observer(function () {
  const data = store.trendData;
  if (!data && !store.trendLoading) return null;

  const hourlyData = (data?.hourly || []).flatMap(item => [
    {time: item.time, type: '报警发生', count: item.alert},
    {time: item.time, type: '故障恢复', count: item.recovery},
  ]);

  return (
    <Card
      loading={store.trendLoading}
      title="告警趋势分析"
      extra={
        <Select
          defaultValue={24}
          style={{width: 120}}
          onChange={v => store.fetchTrend(v)}
          options={[
            {value: 6, label: '近6小时'},
            {value: 12, label: '近12小时'},
            {value: 24, label: '近24小时'},
            {value: 48, label: '近48小时'},
            {value: 72, label: '近72小时'},
          ]}
        />
      }
      style={{marginBottom: 16, borderRadius: 8}}
      styles={{header: {borderBottom: '1px solid #f0f0f0'}}}
    >
      <Row gutter={16} style={{marginBottom: 16}}>
        <Col span={6}>
          <Statistic title="总报警次数" value={data?.total_alerts || 0} valueStyle={{color: '#fa541c'}}/>
        </Col>
        <Col span={6}>
          <Statistic title="总恢复次数" value={data?.total_recoveries || 0} valueStyle={{color: '#52c41a'}}/>
        </Col>
        <Col span={6}>
          <Statistic title="平均恢复时间" value={formatDuration(data?.mttr_seconds || 0)}/>
        </Col>
        <Col span={6}>
          <Statistic
            title="当前活跃告警"
            value={(data?.total_alerts || 0) - (data?.total_recoveries || 0)}
            valueStyle={{color: ((data?.total_alerts || 0) - (data?.total_recoveries || 0)) > 0 ? '#fa541c' : '#52c41a'}}
          />
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={16}>
          <h4 style={{marginBottom: 8, color: '#666'}}>每小时告警/恢复趋势</h4>
          {hourlyData.length === 0 ? (
            <div style={{height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <Empty description="暂无数据"/>
            </div>
          ) : (
            <Chart
              height={280}
              data={hourlyData}
              padding={[20, 20, 60, 50]}
              forceFit
              scale={{count: {alias: '次数', min: 0}}}
            >
              <Axis
                name="time"
                label={{fontSize: 11, textAlign: 'center', autoRotate: true}}
                tickLine={{lineWidth: 1, stroke: '#e8e8e8'}}
              />
              <Axis
                name="count"
                label={{fontSize: 12}}
                grid={{lineStyle: {stroke: '#f0f0f0', lineDash: [4, 4]}}}
              />
              <Legend position="top" offsetY={-5}/>
              <Tooltip
                crosshairs={{type: 'y'}}
                containerStyle={{
                  background: 'rgba(255,255,255,0.95)',
                  borderRadius: 6,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                }}
              />
              <Geom
                type="interval"
                position="time*count"
                color={['type', ['#fa541c', '#52c41a']]}
                adjust={[{type: 'stack'}]}
              />
            </Chart>
          )}
        </Col>
        <Col span={8}>
          <h4 style={{marginBottom: 8, color: '#666'}}>TOP10 异常监控项</h4>
          <Table
            size="small"
            rowKey={(_, i) => i}
            dataSource={data?.top_targets || []}
            pagination={false}
            scroll={{y: 240}}
            columns={[
              {title: '名称', dataIndex: 'name', ellipsis: true, width: 100},
              {title: '对象', dataIndex: 'target', ellipsis: true, width: 80},
              {title: '次数', dataIndex: 'count', width: 50, render: v => <Tag color="orange">{v}</Tag>},
            ]}
          />
        </Col>
      </Row>
    </Card>
  );
})