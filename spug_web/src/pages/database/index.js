import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react';
import { AuthDiv, Breadcrumb } from 'components';
import {
    Card, Tag, Tabs, Space, Typography,
} from 'antd';
import {
    DatabaseOutlined, CheckCircleOutlined,
    ApartmentOutlined, UnorderedListOutlined,
    ScheduleOutlined,
} from '@ant-design/icons';

import store from './store';
import { DB_TYPES } from './dbTypes';
import DatabaseTable from "./components/DatabaseTable";
import DatabaseDrawer from './components/DatabaseDrawer';
import DatabaseDetail from './components/DatabaseDetail';
import SqlTerminal from './components/SqlTerminal';
import ClusterTopology from './components/ClusterTopology';
import ScheduleBackupTable from './components/ScheduleBackupTable';

const { Text } = Typography;

export default observer(function DatabaseDashboard() {
    const [activeTab, setActiveTab] = useState('instances');

    useEffect(() => {
        store.loadData();
    }, []);

    const typeEntries = Object.entries(DB_TYPES)
        .filter(([key]) => store.typeCounts[key]);

    return (
        <>
            <AuthDiv auth="database.instance.view">
                <Breadcrumb items={['首页', '数据库管理']} />
                <Card size="small" style={{ marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
                    <Space size="large" wrap>
                        <Space size={6}>
                            <DatabaseOutlined style={{ color: 'var(--color-primary)' }} />
                            <Text strong>总数</Text>
                            <Text strong style={{ color: 'var(--color-primary)', fontSize: 16 }}>{store.total || 0}</Text>
                        </Space>
                        <Space size={6}>
                            <CheckCircleOutlined style={{ color: 'var(--color-green-600)' }} />
                            <Text type="secondary">在线</Text>
                            <Text strong style={{ color: 'var(--color-green-600)', fontSize: 16 }}>{store.online || 0}</Text>
                        </Space>
                        {typeEntries.map(([key, conf]) => (
                            <Space key={key} size={6}>
                                <Tag color={conf.tagColor} style={{ margin: 0 }}>{conf.label}</Tag>
                                <Text strong style={{ color: conf.hexColor, fontSize: 15 }}>{store.typeCounts[key] || 0}</Text>
                            </Space>
                        ))}
                    </Space>
                </Card>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    style={{ marginBottom: 16 }}
                    items={[
                        {
                            key: 'instances',
                            label: (
                                <Space size={4}>
                                    <UnorderedListOutlined />
                                    <span>实例列表</span>
                                </Space>
                            ),
                            children: <DatabaseTable />,
                        },
                        {
                            key: 'topology',
                            label: (
                                <Space size={4}>
                                    <ApartmentOutlined />
                                    <span>集群拓扑</span>
                                </Space>
                            ),
                            children: <ClusterTopology />,
                        },
                        {
                            key: 'schedule_backup',
                            label: (
                                <Space size={4}>
                                    <ScheduleOutlined />
                                    <span>定时备份</span>
                                </Space>
                            ),
                            children: <ScheduleBackupTable />,
                        },
                    ]}
                />
            </AuthDiv>
            {store.formVisible && <DatabaseDrawer/>}
            {store.detailVisible && <DatabaseDetail/>}
            {store.sqlVisible && <SqlTerminal/>}
        </>
    );
});
