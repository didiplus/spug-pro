import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { Modal, Table, Tag, Form, Input } from 'antd';
import { ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import { message } from 'libs/message';
import { http } from 'libs';
import { AuthDiv, Breadcrumb, TableCard, Action, AuthButton } from 'components';
import HostSelector from 'pages/host/Selector';

function FactsIndex() {
  const [records, setRecords] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [collectVisible, setCollectVisible] = useState(false);
  const [hostIds, setHostIds] = useState([]);
  const [collecting, setCollecting] = useState(false);

  function fetchRecords() {
    setIsFetching(true);
    http.get('/api/ansible/facts/')
      .then(res => setRecords(res))
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
      .then(() => {
        message.success('采集任务已提交');
        setCollectVisible(false);
        setTimeout(fetchRecords, 3000);
      })
      .finally(() => setCollecting(false))
  }

  function showDetail(hostId) {
    http.get(`/api/ansible/facts/${hostId}/`)
      .then(res => { setDetailData(res); setDetailVisible(true) })
  }

  return (
    <AuthDiv auth="ansible.facts.view">
      <Breadcrumb items={['首页', 'Ansible', 'Facts 浏览']}/>
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
          return s.os || '-';
        }}/>
        <Table.Column title="CPU" width={60} render={info => (info.summary?.cpu_count) || '-'}/>
        <Table.Column title="内存(MB)" width={100} render={info => (info.summary?.memory_mb) || '-'}/>
        <Table.Column title="Python" width={100} render={info => (info.summary?.python_version) || '-'}/>
        <Table.Column title="采集时间" dataIndex="collected_at" width={180}/>
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
          <Form.Item label="目标主机">
            <HostSelector type="button" value={hostIds} onChange={setHostIds}/>
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="Facts 详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={800}>
        {detailData && (
          <div>
            <div style={{marginBottom: 16}}>
              <Tag color="blue">{detailData.summary?.os || 'Unknown'}</Tag>
              <Tag>CPU: {detailData.summary?.cpu_count || '-'}</Tag>
              <Tag>内存: {detailData.summary?.memory_mb || '-'} MB</Tag>
              <Tag>Python: {detailData.summary?.python_version || '-'}</Tag>
            </div>
            <Input.TextArea
              value={JSON.stringify(detailData.facts, null, 2)}
              readOnly
              autoSize={{minRows: 20, maxRows: 30}}
              style={{fontFamily: 'monospace', fontSize: 12}}/>
          </div>
        )}
      </Modal>
    </AuthDiv>
  )
}

export default observer(FactsIndex);