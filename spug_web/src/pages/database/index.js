import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react';
import { AuthDiv, Breadcrumb } from 'components';
import {
    Card, Statistic, Row, Col, Tabs,
} from 'antd';
import {
    DatabaseOutlined, CheckCircleOutlined, WindowsOutlined,
    CodepenCircleOutlined, TableOutlined, ApartmentOutlined,
} from '@ant-design/icons';

import store from './store';
import DatabaseTable from "./components/DatabaseTable";
import DatabaseDrawer from './components/DatabaseDrawer';
import DatabaseDetail from './components/DatabaseDetail';
import SqlTerminal from './components/SqlTerminal';
import TopologyView from './components/TopologyView';

export default observer(function DatabaseDashboard() {
    const [activeTab, setActiveTab] = useState('list');

    useEffect(() => {
        store.loadData();
    }, []);

    const tabItems = [
        {
            key: 'list',
            label: (
                <span><TableOutlined style={{ marginRight: 4 }} />实例列表</span>
            ),
            children: <DatabaseTable />,
        },
        {
            key: 'topology',
            label: (
                <span><ApartmentOutlined style={{ marginRight: 4 }} />拓扑视图</span>
            ),
            children: <TopologyView />,
        },
    ];

    return (
        <>
            <AuthDiv auth="database.instance.view">
                <Breadcrumb items={['首页', '数据库管理']} />
                <Row gutter={[16, 16]} style={{marginBottom: '20px'}}>
                    <Col xs={24} sm={12} lg={6}>
                        <Card hoverable style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                            <Statistic
                                title="数据库总数"
                                value={store.total || 0}
                                prefix={<DatabaseOutlined style={{ color: '#1890ff' }} />}
                                valueStyle={{ color: '#1890ff' }}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <Card hoverable style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                            <Statistic
                                title="在线实例"
                                value={store.online || 0}
                                prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                                valueStyle={{ color: '#52c41a' }}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <Card hoverable style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                            <Statistic
                                title="MySQL"
                                value={store.mysql || 0}
                                prefix={<WindowsOutlined style={{ color: '#fa8c16' }} />}
                                valueStyle={{ color: '#fa8c16' }}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <Card hoverable style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                            <Statistic
                                title="Redis"
                                value={store.redis || 0}
                                prefix={<CodepenCircleOutlined style={{ color: '#eb2f96' }} />}
                                valueStyle={{ color: '#eb2f96' }}
                            />
                        </Card>
                    </Col>
                </Row>
                <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
            </AuthDiv>
            {store.formVisible && <DatabaseDrawer/>}
            {store.detailVisible && <DatabaseDetail/>}
            {store.sqlVisible && <SqlTerminal/>}
        </>
    );
});
