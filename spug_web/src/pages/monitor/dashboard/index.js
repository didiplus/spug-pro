import React from 'react';
import { observer } from 'mobx-react';
import { Modal, Card, Row, Col, Button, Tag, Space, Typography, Empty, Spin } from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined, DeleteOutlined, DashboardOutlined } from '@ant-design/icons';
import { message } from 'libs/message';
import { AuthDiv, Breadcrumb, AuthButton } from 'components';
import store from './store';
import Editor from './Editor';
import DashboardView from './View';

const { Text, Paragraph } = Typography;

@observer
class DashboardList extends React.Component {
  componentDidMount() {
    store.fetchRecords();
  }

  handleDelete = (record) => {
    Modal.confirm({
      title: '删除确认',
      content: `确定要删除大盘【${record.name}】？`,
      onOk: () => store.handleDelete(record.id, () => message.success('删除成功'))
    })
  };

  render() {
    return (
      <AuthDiv auth="monitor.monitor.view">
        <Breadcrumb items={['首页', '监控中心', '监控大盘']}/>
        <div style={{marginBottom: 16, display: 'flex', justifyContent: 'space-between'}}>
          <Text strong style={{fontSize: 16}}>监控大盘</Text>
          <AuthButton auth="monitor.monitor.view" type="primary" icon={<PlusOutlined/>} onClick={() => store.showEditor()}>新建大盘</AuthButton>
        </div>
        <Spin spinning={store.isFetching}>
          {store.dashboards.length === 0 ? (
            <Empty description="暂无大盘，点击右上角创建" style={{marginTop: 80}}/>
          ) : (
            <Row gutter={[16, 16]}>
              {store.dashboards.map(d => (
                <Col key={d.id} xs={24} sm={12} md={8} lg={6}>
                  <Card
                    hoverable
                    size="small"
                    actions={[
                      <EyeOutlined key="view" onClick={() => store.showView(d.id)}/>,
                      <EditOutlined key="edit" onClick={() => store.showEditor(d.id)}/>,
                      <DeleteOutlined key="del" onClick={() => this.handleDelete(d)}/>,
                    ]}>
                    <Card.Meta
                      avatar={<DashboardOutlined style={{fontSize: 28, color: 'var(--color-primary)'}}/>}
                      title={<Text ellipsis style={{maxWidth: 160}}>{d.name}</Text>}
                      description={
                        <Space direction="vertical" size={2} style={{width: '100%'}}>
                          <Text type="secondary" ellipsis style={{fontSize: 12}}>
                            {d.desc || '暂无描述'}
                          </Text>
                          <Space size={8}>
                            <Tag color="blue">{d.panel_count} 面板</Tag>
                            <Text type="secondary" style={{fontSize: 12}}>{d.refresh}s 刷新</Text>
                          </Space>
                        </Space>
                      }
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Spin>
        {store.editorVisible && <Editor/>}
        {store.viewVisible && <DashboardView/>}
      </AuthDiv>
    )
  }
}

export default DashboardList;