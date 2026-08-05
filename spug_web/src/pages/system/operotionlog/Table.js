import React from 'react';
import { observer } from 'mobx-react';
import { Tag, Radio, Button, Modal, Descriptions, Typography } from 'antd';
import { TableCard, ACEditor } from 'components';
import store from './store';

const { Text } = Typography;

@observer
class ComTable extends React.Component {
  state = {
    visible: false,
    current: {},
  };

  formatJson = (data) => {
    if (!data) return '';
    if (typeof data === 'string') {
      try {
        return JSON.stringify(JSON.parse(data), null, 2);
      } catch (e) {
        try {
          let jsonStr = data.replace(/'/g, '"');
          return JSON.stringify(JSON.parse(jsonStr), null, 2);
        } catch (err) {
          return data;
        }
      }
    }
    return JSON.stringify(data, null, 2);
  };

  componentDidMount() {
    store.fetchRecords();
  }

  showDetail = (record) => {
    this.setState({ visible: true, current: record });
  };

  columns = [
    { title: '时间', width: 170, dataIndex: 'create_time' },
    { title: '用户', width: 100, dataIndex: 'username' },
    { title: '模块', width: 120, dataIndex: 'module' },
    {
      title: '请求方式', width: 100, dataIndex: 'method',
      render: (text) => <Tag color="blue">{text}</Tag>,
    },
    { title: 'IP', width: 140, dataIndex: 'client_ip' },
    {
      title: '状态', width: 90,
      render: (record) =>
        record.status === 'success'
          ? <Tag color="success">成功</Tag>
          : <Tag color="error">失败</Tag>,
    },
    {
      title: '耗时', width: 100,
      render: (record) => `${record.cost_time || 0} ms`,
    },
    {
      title: '操作', width: 80,
      render: (record) => (
        <Button type="link" onClick={() => this.showDetail(record)}>详情</Button>
      ),
    },
  ];

  render() {
    const { current } = this.state;

    return (
      <>
        <TableCard
          tKey="operation_log"
          rowKey="id"
          title="操作日志"
          loading={store.isFetching}
          dataSource={store.records}
          onReload={store.fetchRecords}
          actions={[
            <Radio.Group
              key="status"
              value={store.f_status}
              onChange={(e) => {
                store.f_status = e.target.value;
                store.current = 1;
                store.fetchRecords();
              }}
            >
              <Radio.Button value="">全部</Radio.Button>
              <Radio.Button value="success">成功</Radio.Button>
              <Radio.Button value="failed">失败</Radio.Button>
            </Radio.Group>,
          ]}
          pagination={{
            current: store.current,
            pageSize: store.pageSize,
            total: store.total,
            showSizeChanger: true,
            showLessItems: true,
            showTotal: (total) => `共 ${total} 条`,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, pageSize) => store.setPage(page, pageSize),
          }}
          columns={this.columns}
        />

        <Modal
          title="操作详情"
          open={this.state.visible}
          width={900}
          footer={null}
          onCancel={() => this.setState({ visible: false })}
          styles={{
            body: { padding: '24px 24px 32px' },
          }}
        >
          <Descriptions
            bordered
            column={1}
            labelStyle={{
              width: 120,
              fontWeight: 500,
              background: '#fafafa',
            }}
            contentStyle={{
              background: '#ffffff',
            }}
          >
            <Descriptions.Item label="请求地址">
              <Text copyable>{current.url}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="请求参数">
              <div style={{
                background: '#f5f5f5',
                borderRadius: 6,
                padding: 4,
                marginTop: -4,
              }}>
                <ACEditor
                  mode="json"
                  value={this.formatJson(current.request_params)}
                  height="200px"
                  width="100%"
                  readOnly
                />
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="响应结果">
              <div style={{
                background: '#f5f5f5',
                borderRadius: 6,
                padding: 4,
                marginTop: -4,
              }}>
                <ACEditor
                  mode="json"
                  value={this.formatJson(current.response_data)}
                  height="250px"
                  width="100%"
                  readOnly
                />
              </div>
            </Descriptions.Item>
          </Descriptions>
        </Modal>
      </>
    );
  }
}

export default ComTable;