/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useState, useEffect } from 'react';
import { Card, DatePicker } from 'antd';
import { Chart, Geom, Axis, Tooltip } from 'bizcharts';
import styles from './index.module.css';
import dayjs from 'dayjs';
import { http } from 'libs';


export default function () {
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState([dayjs(), dayjs()]);
  const [range, setRange] = useState('day');
  const [res, setRes] = useState([])

  useEffect(() => {
    setLoading(true);
    const strDuration = duration.map(x => x.format('YYYY-MM-DD'))
    http.post('/api/home/request/', {duration: strDuration})
      .then(res => setRes(res))
      .finally(() => setLoading(false))
  }, [duration])

  function handleClick(val) {
    let duration = [];
    switch (val) {
      case 'day':
        setRange('day');
        duration = [dayjs(), dayjs()];
        break;
      case 'week':
        setRange('week');
        duration = [dayjs().startOf('week'), dayjs().endOf('week')];
        break;
      case 'month':
        setRange('month');
        const s_date = dayjs().startOf('month')
        const e_date = dayjs().endOf('month')
        duration = [s_date, e_date];
        break;
      default:
        setRange('custom')
        duration = val
    }
    setDuration(duration)
  }

  return (
    <Card loading={loading} title="发布申请Top20" style={{marginTop: 20}} styles={{body: {height: 353}}} extra={(
      <div style={{display: 'flex', alignItems: 'center'}}>
        <span className={range === 'day' ? styles.spanButtonActive : styles.spanButton}
              onClick={() => handleClick('day')}>今日</span>
        <span className={range === 'week' ? styles.spanButtonActive : styles.spanButton}
              onClick={() => handleClick('week')}>本周</span>
        <span className={range === 'month' ? styles.spanButtonActive : styles.spanButton}
              onClick={() => handleClick('month')}>本月</span>
        <DatePicker.RangePicker allowClear={false} style={{width: 250}} value={duration} onChange={handleClick}/>
      </div>
    )}>
      <Chart height={300} data={res} padding={[10, 0, 30, 35]} scale={{count: {alias: '发布申请数量'}}} forceFit>
        <Axis name="name"/>
        <Axis name="count" title/>
        <Tooltip/>
        <Geom type="interval" position="name*count"/>
      </Chart>
    </Card>
  )
}
