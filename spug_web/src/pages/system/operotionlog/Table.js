import React from 'react';
import { observer } from 'mobx-react';
import { Tag, Radio, Button, Modal, Descriptions, Typography, Input, Tabs, Tooltip } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { TableCard, ACEditor, SearchForm } from 'components';
import store from './store';

const { Text } = Typography;

const METHOD_COLORS = {
  GET: 'blue',
  POST: 'success',
  PUT: 'warning',
  PATCH: 'purple',
  DELETE: 'error',
};

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

  renderCostTime = (ms) => {
    const val = ms || 0;
    let color = '#52c41a';
    if (val > 3000) color = '#ff4d4f';
    else if (val > 1000) color = '#fa8c16';
    return <Text style={{ color }}>{val} ms</Text>;
  };

  columns = [
    {
      title: '时间', width: 170, dataIndex: 'create_time',
      render: v => v || <Text type="secondary">-</Text>,
    },
    {
      title: '用户', width: 100, dataIndex: 'username',
      render: v => <Text strong>{v}</Text>,
    },
    {
      title: '模块', width: 120, dataIndex: 'module',
      ellipsis: true,
      render: v => v ? <Tag style={{ margin: 0 }}>{v}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: '请求方式', width: 90, dataIndex: 'method', align: 'center',
      render: v => v ? <Tag color={METHOD_COLORS[v] || 'default'} style={{ margin: 0 }}>{v}</Tag> : '-',
    },
    {
      title: '请求路径', dataIndex: 'uri', ellipsis: true,
      render: v => v ? <Tooltip title={v}><Text style={{ fontSize: 13 }}>{v}</Text></Tooltip> : '-',
    },
    {
      title: 'IP', width: 140, dataIndex: 'client_ip',
      render: v => v || <Text type="secondary">-</Text>,
    },
    {
      title: '状态', width: 80, align: 'center',
      render: r => r.status === 'success'
        ? <Tag color="success" style={{ margin: 0 }}>成功</Tag>
        : <Tag color="error" style={{ margin: 0 }}>失败</Tag>,
    },
    {
      title: '耗时', width: 100, align: 'center',
      render: r => this.renderCostTime(r.cost_time),
    },
    {
      title: '操作', width: 70, align: 'center',
      render: r => (
        <Tooltip title="详情">
          <Button type="link" size="small" icon={<EyeOutlined/>} onClick={() => this.showDetail(r)}/>
        </Tooltip>
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
          styles={{ body: { padding: '16px 24px 24px' } }}
        >
          <Descriptions
            size="small"
            column={2}
            bordered
            labelStyle={{ width: 100, fontWeight: 500, background: '#fafafa' }}
            contentStyle={{ background: '#ffffff' }}
          >
            <Descriptions.Item label="用户">{current.username}</Descriptions.Item>
            <Descriptions.Item label="状态码">{current.response_status}</Descriptions.Item>
            <Descriptions.Item label="请求方法">
              <Tag color={METHOD_COLORS[current.method] || 'default'}>{current.method}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="耗时">{this.renderCostTime(current.cost_time)}</Descriptions.Item>
            <Descriptions.Item label="模块">{current.module || '-'}</Descriptions.Item>
            <Descriptions.Item label="客户端 IP">{current.client_ip || '-'}</Descriptions.Item>
            <Descriptions.Item label="请求地址" span={2}>
              <Text copyable style={{ fontSize: 13 }}>{current.uri || current.url}</Text>
            </Descriptions.Item>
            {current.error_message && (
              <Descriptions.Item label="错误信息" span={2}>
                <Text type="danger">{current.error_message}</Text>
              </Descriptions.Item>
            )}
          </Descriptions>

          <Tabs
            style={{ marginTop: 16 }}
            items={[
              {
                key: 'request',
                label: '请求参数',
                children: (
                  <div style={{ background: '#f5f5f5', borderRadius: 6, padding: 4 }}>
                    <ACEditor
                      mode="json"
                      value={this.formatJson(current.request_params)}
                      height="220px"
                      width="100%"
                      readOnly
                    />
                  </div>
                ),
              },
              {
                key: 'response',
                label: '响应结果',
                children: (
                  <div style={{ background: '#f5f5f5', borderRadius: 6, padding: 4 }}>
                    <ACEditor
                      mode="json"
                      value={this.formatJson(current.response_data)}
                      height="220px"
                      width="100%"
                      readOnly
                    />
                  </div>
                ),
              },
            ]}
          />
        </Modal>
      </>
    );
  }
}

export default ComTable;
