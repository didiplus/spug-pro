import React from 'react';
import { Modal, Tabs, Spin, Tag, Typography, Flex } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, CopyOutlined } from '@ant-design/icons';
import { StatisticsCard } from 'components';
import http from 'libs/http';
import store from './store';
import moment from 'moment';

const { Text } = Typography;

class ComForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true,
      info: {}
    }
  }

  componentDidMount() {
    http.get(`/api/schedule/${store.record.id}/?id=${store.record.h_id}`)
      .then(info => this.setState({info}))
      .finally(() => this.setState({loading: false}))
  }

  render() {
    const {run_time, success, failure, duration, outputs} = this.state.info;

    return (
      <Modal
        visible
        width={800}
        maskClosable={false}
        title="任务执行详情"
        onCancel={() => store.infoVisible = false}
        footer={null}>
        <Spin spinning={this.state.loading}>
          <StatisticsCard loading={this.state.loading}>
            <StatisticsCard.Item title="执行成功" value={<span style={{color: '#3f8600'}}>{success}</span>}/>
            <StatisticsCard.Item title="执行失败" value={<span style={{color: failure > 0 ? '#cf1322' : '#8c8c8c'}}>{failure}</span>}/>
            <StatisticsCard.Item bordered={false} title="平均耗时(秒)" value={<span style={{color: '#1677ff'}}>{duration}</span>}/>
          </StatisticsCard>
          {outputs && (
            <Tabs
              tabPosition="left"
              defaultActiveKey="0"
              style={{height: 350}}
              items={outputs.map((item, index) => ({
                key: `${index}`,
                label: item.code === 0
                  ? <span><CheckCircleOutlined style={{color: '#52c41a', marginRight: 4}} />{item.name}</span>
                  : <span><CloseCircleOutlined style={{color: '#ff4d4f', marginRight: 4}} />{item.name}</span>,
                children: (
                  <Flex vertical gap={8} style={{padding: '4px 0'}}>
                    <Flex align="center" gap={8}>
                      <ClockCircleOutlined style={{color: '#8c8c8c'}} />
                      <Text type="secondary">{run_time}</Text>
                      <Text type="secondary" style={{fontSize: 12}}>({moment(run_time).fromNow()})</Text>
                    </Flex>
                    <Flex align="center" gap={8}>
                      <Tag color={item.code === 0 ? 'success' : 'error'} style={{margin: 0}}>
                        {item.code === 0 ? '执行成功' : '执行失败'}
                      </Tag>
                      <Text type="secondary">耗时 {item.duration}s</Text>
                    </Flex>
                    <div style={{marginTop: 4}}>
                      <Flex align="center" justify="space-between" style={{marginBottom: 4}}>
                        <Text strong style={{fontSize: 13}}>执行输出</Text>
                        <Text
                          copyable={{text: item.output, icon: [<CopyOutlined key="copy" />, <CopyOutlined key="copied" />], tooltips: ['复制', '已复制']}}
                          style={{fontSize: 12}}
                        />
                      </Flex>

                      <pre style={{
                        margin: 0,
                        backgroundColor: '#f6f8fa',
                        borderRadius: 6,
                        padding: 12,
                        maxHeight: 180,
                        overflow: 'auto',
                        fontSize: 13,
                        lineHeight: 1.6,
                        border: '1px solid #d0d7de',
                        wordBreak: 'break-all',
                        whiteSpace: 'pre-wrap',
                      }}>{item.output}</pre>
                    </div>
                  </Flex>
                )
              }))}
            />
          )}
        </Spin>
      </Modal>
    )
  }
}

export default ComForm
