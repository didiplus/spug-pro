/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import { Statistic, Card, Row, Col } from 'antd';
import {
  AppstoreOutlined,
  ClusterOutlined,
  ScheduleOutlined,
  MonitorOutlined,
} from '@ant-design/icons';
import { http } from 'libs';
import styles from './StatisticCard.module.css';
import 'styles/tokens.css';
import './tokens.css';

export default class StatisticCard extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true,
      res: {},
    };
  }

  componentDidMount() {
    http
      .get('/api/home/statistic/')
      .then((res) => this.setState({ res }))
      .finally(() => this.setState({ loading: false }));
  }

  get items() {
    const { res } = this.state;
    return [
      { key: 'app', title: '应用', value: res.app, suffix: '个', link: '/deploy/app', icon: <AppstoreOutlined />, color: 'var(--stat-color-app)' },
      { key: 'host', title: '主机', value: res.host, suffix: '台', link: '/host', icon: <ClusterOutlined />, color: 'var(--stat-color-host)' },
      { key: 'task', title: '任务', value: res.task, suffix: '个', link: '/schedule', icon: <ScheduleOutlined />, color: 'var(--stat-color-task)' },
      { key: 'detection', title: '监控', value: res.detection, suffix: '项', link: '/monitor', icon: <MonitorOutlined />, color: 'var(--stat-color-detection)' },
    ];
  }

  render() {
    const { loading } = this.state;

    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 'var(--space-5)' }}>
        {this.items.map((item) => (
          <Col xs={12} sm={12} md={6} key={item.key}>
            <Card
              loading={loading}
              className={styles.card}
              style={{ '--item-color': item.color }}
            >
              <div className={styles.inner}>
                <div className={styles.icon}>{item.icon}</div>
                <div className={styles.content}>
                  <Statistic
                    title={<span className={styles.title}>{item.title}</span>}
                    value={item.value ?? 0}
                    suffix={<span className={styles.suffix}>{item.suffix}</span>}
                    valueStyle={{
                      fontSize: 'var(--stat-value-size)',
                      fontWeight: 'var(--font-weight-medium)',
                      color: 'var(--item-color)',
                    }}
                    formatter={(v) => <a href={item.link} className={styles.valueLink}>{v}</a>}
                  />
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    );
  }
}
