import React, { useEffect } from 'react';
import { observer } from 'mobx-react';
import { AuthDiv, Breadcrumb } from 'components';
import {
    Card, Statistic, Row, Col, Tag,
} from 'antd';
import {
    DatabaseOutlined, CheckCircleOutlined,
} from '@ant-design/icons';

import store from './store';
import { DB_TYPES } from './dbTypes';
import DatabaseTable from "./components/DatabaseTable";
import DatabaseDrawer from './components/DatabaseDrawer';
import DatabaseDetail from './components/DatabaseDetail';
import SqlTerminal from './components/SqlTerminal';

export default observer(function DatabaseDashboard() {
    useEffect(() => {
        store.loadData();
    }, []);

    const typeCards = Object.entries(DB_TYPES)
        .filter(([key]) => store.typeCounts[key])
        .slice(0, 4)
        .map(([key, conf]) => (
            <Col key={key} xs={24} sm={12} lg={6}>
                <Card hoverable style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <Statistic
                        title={<Tag color={conf.tagColor} style={{ margin: 0 }}>{conf.label}</Tag>}
                        value={store.typeCounts[key] || 0}
                        prefix={<DatabaseOutlined style={{ color: conf.hexColor }} />}
                        valueStyle={{ color: conf.hexColor }}
                    />
                </Card>
            </Col>
        ));

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
                    {typeCards}
                </Row>
                <DatabaseTable />
            </AuthDiv>
            {store.formVisible && <DatabaseDrawer/>}
            {store.detailVisible && <DatabaseDetail/>}
            {store.sqlVisible && <SqlTerminal/>}
        </>
    );
});
