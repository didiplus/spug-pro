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

  // 统计项配置
  get items() {
    const { res } = this.state;
    return [
      {
        key: 'app',
        title: '应用',
        value: res.app,
        suffix: '个',
        link: '/deploy/app',
        icon: <AppstoreOutlined />,
        color: '#1890ff',
      },
      {
        key: 'host',
        title: '主机',
        value: res.host,
        suffix: '台',
        link: '/host',
        icon: <ClusterOutlined />,
        color: '#52c41a',
      },
      {
        key: 'task',
        title: '任务',
        value: res.task,
        suffix: '个',
        link: '/schedule',
        icon: <ScheduleOutlined />,
        color: '#fa8c16',
      },
      {
        key: 'detection',
        title: '监控',
        value: res.detection,
        suffix: '项',
        link: '/monitor',
        icon: <MonitorOutlined />,
        color: '#722ed1',
      },
    ];
  }

  render() {
    const { loading } = this.state;

    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {this.items.map((item) => (
          <Col xs={12} sm={12} md={6} key={item.key}>
            <Card
              loading={loading}
  
              className="statistic-card"
              style={{
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
                height: '100%',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow =
                  '0 4px 16px rgba(0,0,0,0.12)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow =
                  '0 2px 8px rgba(0,0,0,0.06)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    fontSize: 32,
                    color: item.color,
                    lineHeight: 1,
                  }}
                >
                  {item.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Statistic
                    title={
                      <span style={{ fontSize: 14, color: '#8c8c8c' }}>
                        {item.title}
                      </span>
                    }
                    value={item.value ?? 0}
                    suffix={
                      <span style={{ fontSize: 14, color: '#8c8c8c' }}>
                        {item.suffix}
                      </span>
                    }
                    valueStyle={{
                      fontSize: 28,
                      fontWeight: 500,
                      color: item.color,
                    }}
                    formatter={(v) => <a href={item.link}>{v}</a>}
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