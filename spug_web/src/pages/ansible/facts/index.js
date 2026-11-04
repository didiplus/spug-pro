import React, { useState, useEffect, useMemo } from 'react';
import { observer } from 'mobx-react';
import { Modal, Table, Tag, Form, Drawer, Input, Tabs, Space, Typography, Button, Tooltip, App } from 'antd';
import { ReloadOutlined, EyeOutlined, DesktopOutlined, CheckCircleOutlined, CloudOutlined, SearchOutlined, SyncOutlined, GlobalOutlined, HddOutlined, CodeOutlined } from '@ant-design/icons';
import { message } from 'libs/message';
import { http } from 'libs';
import { AuthDiv, Breadcrumb, TableCard, Action, AuthButton } from 'components';
import HostSelector from 'pages/host/Selector';
import TerminalOutput from 'components/TerminalOutput';
import styles from './facts.module.css';

const { Text } = Typography;

const SUMMARY_FIELDS = [
  { key: 'ansible_distribution', label: '操作系统', icon: <DesktopOutlined /> },
  { key: 'ansible_distribution_version', label: '系统版本' },
  { key: 'ansible_os_family', label: '系统家族' },
  { key: 'ansible_architecture', label: '架构' },
  { key: 'ansible_kernel', label: '内核版本' },
  { key: 'ansible_hostname', label: '主机名' },
  { key: 'ansible_fqdn', label: 'FQDN' },
  { key: 'ansible_processor_vcpus', label: 'CPU 核数', icon: <HddOutlined /> },
  { key: 'ansible_processor_count', label: 'CPU 物理数' },
  { key: 'ansible_memtotal_mb', label: '内存 (MB)' },
  { key: 'ansible_swapfree_mb', label: 'Swap (MB)' },
  { key: 'ansible_python_version', label: 'Python 版本', icon: <CodeOutlined /> },
  { key: 'ansible_default_ipv4', label: '默认 IPv4', icon: <GlobalOutlined />, transform: v => typeof v === 'object' ? v?.address : v },
  { key: 'ansible_product_name', label: '硬件型号' },
  { key: 'ansible_virtualization_type', label: '虚拟化类型' },
  { key: 'ansible_bios_version', label: 'BIOS 版本' },
  { key: 'ansible_system_vendor', label: '厂商' },
];

function FactsIndex() {
  const [records, setRecords] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailTab, setDetailTab] = useState('summary');
  const [factsSearch, setFactsSearch] = useState('');
  const [collectVisible, setCollectVisible] = useState(false);
  const [hostIds, setHostIds] = useState([]);
  const [collecting, setCollecting] = useState(false);
  const [outputToken, setOutputToken] = useState(null);
  const [outputVisible, setOutputVisible] = useState(false);
  const [quickCollecting, setQuickCollecting] = useState(null);
  const { modal } = App.useApp();

  function fetchRecords() {
    setIsFetching(true);
    http.get('/api/ansible/facts/')
      .then(res => setRecords(res))
      .catch(() => {})
      .finally(() => setIsFetching(false))
  }

  useEffect(() => { fetchRecords() }, []);

  function handleCollect() {
    if (hostIds.length === 0) {
      message.error('请选择目标主机');
      return;
    }
    setCollecting(true);
    http.post('/api/ansible/facts/collect/', {host_ids: hostIds})
      .then(token => {
        setCollectVisible(false);
        setOutputToken(token);
        setOutputVisible(true);
      })
      .catch(() => {})
      .finally(() => setCollecting(false))
  }

  function handleQuickCollect(hostId, hostName) {
    setQuickCollecting(hostId);
    http.post('/api/ansible/facts/collect/', {host_ids: [hostId]})
      .then(token => {
        setOutputToken(token);
        setOutputVisible(true);
      })
      .catch(() => {})
      .finally(() => setQuickCollecting(null))
  }

  function showDetail(hostId) {
    setFactsSearch('');
    setDetailTab('summary');
    http.get(`/api/ansible/facts/${hostId}/`)
      .then(res => { setDetailData(res); setDetailVisible(true) })
      .catch(() => {})
  }

  const filteredFacts = useMemo(() => {
    if (!detailData?.facts || !factsSearch) return null;
    const result = {};
    const lower = factsSearch.toLowerCase();
    Object.entries(detailData.facts).forEach(([k, v]) => {
      if (k.toLowerCase().includes(lower)) {
        result[k] = v;
      }
    });
    return result;
  }, [detailData, factsSearch]);

  const totalHosts = records.length;
  const linuxCount = records.filter(r => r.summary?.os_family === 'RedHat' || r.summary?.os_family === 'Debian').length;
  const recentCount = records.filter(r => {
    if (!r.collected_at) return false;
    const diff = Date.now() - new Date(r.collected_at.replace(' ', 'T')).getTime();
    return diff < 24 * 60 * 60 * 1000;
  }).length;

  const summaryCards = detailData?.facts ? SUMMARY_FIELDS.map(f => {
    const raw = detailData.facts[f.key];
    const value = f.transform ? f.transform(raw) : raw;
    return { ...f, value: value ?? '-' };
  }).filter(f => f.value !== '-' && f.value !== '' && f.value !== null) : [];

  return (
    <AuthDiv auth="ansible.facts.view">
      <Breadcrumb items={['首页', 'Ansible', 'Facts 浏览']}/>

      <div className={styles.overviewRow}>
        <div className={styles.overviewCard}>
          <div className={`${styles.overviewIcon} ${styles.overviewIconBlue}`}>
            <DesktopOutlined/>
          </div>
          <div className={styles.overviewInfo}>
            <span className={styles.overviewValue}>{totalHosts}</span>
            <span className={styles.overviewLabel}>已采集主机</span>
          </div>
        </div>
        <div className={styles.overviewCard}>
          <div className={`${styles.overviewIcon} ${styles.overviewIconGreen}`}>
            <CheckCircleOutlined/>
          </div>
          <div className={styles.overviewInfo}>
            <span className={styles.overviewValue}>{recentCount}</span>
            <span className={styles.overviewLabel}>24小时内更新</span>
          </div>
        </div>
        <div className={styles.overviewCard}>
          <div className={`${styles.overviewIcon} ${styles.overviewIconOrange}`}>
            <CloudOutlined/>
          </div>
          <div className={styles.overviewInfo}>
            <span className={styles.overviewValue}>{linuxCount}</span>
            <span className={styles.overviewLabel}>Linux 主机</span>
          </div>
        </div>
      </div>

      <TableCard
        tKey="facts"
        title="Facts 缓存列表"
        rowKey="id"
        loading={isFetching}
        dataSource={records}
        onReload={fetchRecords}
        actions={[
          <AuthButton auth="ansible.facts.collect" type="primary" icon={<ReloadOutlined/>} onClick={() => setCollectVisible(true)}>批量采集</AuthButton>
        ]}>
        <Table.Column title="主机名" dataIndex="host" render={v => v?.name || '-'}/>
        <Table.Column title="IP" dataIndex="host" render={v => v?.hostname || '-'}/>
        <Table.Column title="OS" width={150} render={info => {
          const s = info.summary || {};
          return s.os ? <Tag color="blue" style={{margin: 0}}>{s.os}</Tag> : '-';
        }}/>
        <Table.Column title="CPU" width={100} render={info => (info.summary?.cpu_count) || '-'}/>
        <Table.Column title="内存(MB)" width={100} render={info => (info.summary?.memory_mb) || '-'}/>
        <Table.Column title="Python" width={100} render={info => (info.summary?.python_version) || '-'}/>
        <Table.Column title="采集时间" dataIndex="collected_at" width={180} render={v => v || '-'}/>
        <Table.Column title="操作" width={250} render={info => (
          <Action>
            <Action.Button icon={<EyeOutlined/>} onClick={() => showDetail(info.host_id)}>详情</Action.Button>
            <Action.Button
              auth="ansible.facts.collect"
              icon={<SyncOutlined spin={quickCollecting === info.host_id} />}
              disabled={quickCollecting === info.host_id}
              onClick={() => handleQuickCollect(info.host_id, info.host?.name)}
            >采集</Action.Button>
          </Action>
        )}/>
      </TableCard>

      <Modal
        title="批量采集 Facts"
        open={collectVisible}
        onCancel={() => setCollectVisible(false)}
        onOk={handleCollect}
        confirmLoading={collecting}>
        <Form layout="vertical">
          <Form.Item label="目标主机" extra="采集将通过 WebSocket 实时反馈进度">
            <HostSelector type="button" value={hostIds} onChange={setHostIds}/>
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="Facts 采集进度"
        placement="right"
        width="65%"
        open={outputVisible}
        onClose={() => { setOutputVisible(false); setOutputToken(null); fetchRecords(); }}
        styles={{body: {padding: 0, height: 'calc(100vh - 55px)', overflow: 'hidden'}}}
        destroyOnClose>
        {outputToken && <TerminalOutput runToken={outputToken} title="Facts 采集输出" />}
      </Drawer>

      <Modal
        title="Facts 详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={900}>
        {detailData && (
          <div>
            <div className={styles.detailHeader}>
              <Tag color="blue">{detailData.summary?.os || 'Unknown'}</Tag>
              <Tag>CPU: {detailData.summary?.cpu_count || '-'}</Tag>
              <Tag>内存: {detailData.summary?.memory_mb || '-'} MB</Tag>
              <Tag>Python: {detailData.summary?.python_version || '-'}</Tag>
              {detailData.ansible_version && <Tag color="cyan">Ansible: {detailData.ansible_version}</Tag>}
            </div>
            <Tabs
              activeKey={detailTab}
              onChange={setDetailTab}
              items={[
                {
                  key: 'summary',
                  label: <span><DesktopOutlined /> 摘要</span>,
                  children: (
                    <div className={styles.summaryGrid}>
                      {summaryCards.map(card => (
                        <div key={card.key} className={styles.summaryCard}>
                          <div className={styles.summaryCardLabel}>
                            {card.icon && <span className={styles.summaryCardIcon}>{card.icon}</span>}
                            {card.label}
                          </div>
                          <div className={styles.summaryCardValue}>{String(card.value)}</div>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  key: 'raw',
                  label: <span><CodeOutlined /> 原始 JSON</span>,
                  children: (
                    <div>
                      <Input
                        placeholder="搜索 Facts 字段名（如 ansible_、memory、ipv4）"
                        allowClear
                        value={factsSearch}
                        onChange={e => setFactsSearch(e.target.value)}
                        prefix={<SearchOutlined style={{ color: 'var(--color-text-tertiary)' }} />}
                        style={{ marginBottom: 8 }}
                      />
                      {factsSearch && (
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                          匹配 {Object.keys(filteredFacts || {}).length} / {Object.keys(detailData.facts || {}).length} 个字段
                        </Text>
                      )}
                      <pre className={styles.factsJson}>
                        {JSON.stringify(factsSearch ? filteredFacts : detailData.facts, null, 2)}
                      </pre>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}
      </Modal>
    </AuthDiv>
  )
}

export default observer(FactsIndex);
