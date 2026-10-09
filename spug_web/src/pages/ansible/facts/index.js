import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { Modal, Table, Tag, Form, Drawer } from 'antd';
import { ReloadOutlined, EyeOutlined, DesktopOutlined, CheckCircleOutlined, CloudOutlined } from '@ant-design/icons';
import { message } from 'libs/message';
import { http } from 'libs';
import { AuthDiv, Breadcrumb, TableCard, Action, AuthButton } from 'components';
import HostSelector from 'pages/host/Selector';
import TerminalOutput from 'components/TerminalOutput';
import styles from './facts.module.css';


function FactsIndex() {
  const [records, setRecords] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [collectVisible, setCollectVisible] = useState(false);
  const [hostIds, setHostIds] = useState([]);
  const [collecting, setCollecting] = useState(false);
  const [outputToken, setOutputToken] = useState(null);
  const [outputVisible, setOutputVisible] = useState(false);

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

  function showDetail(hostId) {
    http.get(`/api/ansible/facts/${hostId}/`)
      .then(res => { setDetailData(res); setDetailVisible(true) })
      .catch(() => {})
  }

  const totalHosts = records.length;
  const linuxCount = records.filter(r => r.summary?.os_family === 'RedHat' || r.summary?.os_family === 'Debian').length;
  const recentCount = records.filter(r => {
    if (!r.collected_at) return false;
    const diff = Date.now() - new Date(r.collected_at.replace(' ', 'T')).getTime();
    return diff < 24 * 60 * 60 * 1000;
  }).length;

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
        <Table.Column title="CPU" width={60} render={info => (info.summary?.cpu_count) || '-'}/>
        <Table.Column title="内存(MB)" width={100} render={info => (info.summary?.memory_mb) || '-'}/>
        <Table.Column title="Python" width={100} render={info => (info.summary?.python_version) || '-'}/>
        <Table.Column title="采集时间" dataIndex="collected_at" width={180} render={v => v || '-'}/>
        <Table.Column title="操作" width={80} render={info => (
          <Action>
            <Action.Button icon={<EyeOutlined/>} onClick={() => showDetail(info.host_id)}>详情</Action.Button>
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
        width={800}>
        {detailData && (
          <div>
            <div className={styles.detailHeader}>
              <Tag color="blue">{detailData.summary?.os || 'Unknown'}</Tag>
              <Tag>CPU: {detailData.summary?.cpu_count || '-'}</Tag>
              <Tag>内存: {detailData.summary?.memory_mb || '-'} MB</Tag>
              <Tag>Python: {detailData.summary?.python_version || '-'}</Tag>
              {detailData.ansible_version && <Tag color="cyan">Ansible: {detailData.ansible_version}</Tag>}
            </div>
            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>原始 Facts 数据</div>
              <pre className={styles.factsJson}>{JSON.stringify(detailData.facts, null, 2)}</pre>
            </div>
          </div>
        )}
      </Modal>
    </AuthDiv>
  )
}

export default observer(FactsIndex);
