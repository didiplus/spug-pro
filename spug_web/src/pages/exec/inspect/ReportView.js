import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { Modal, Card, Tag, Statistic, Row, Col, Table, Progress, Space, Button, Empty, Descriptions } from 'antd';
import { DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import { http, X_TOKEN } from 'libs';
import S from './store';

const statusMap = {
  success: {color: 'success', text: '正常'},
  warning: {color: 'warning', text: '告警'},
  error: {color: 'error', text: '失败'},
  pending: {color: 'default', text: '待执行'},
  running: {color: 'processing', text: '执行中'},
};

function OutputModal({record, onClose}) {
  return (
    <Modal
      open
      width={750}
      title={`执行输出 - ${record.host_name} / ${record.item_name}`}
      onCancel={onClose}
      footer={null}>
      <pre style={{
        background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 6,
        maxHeight: 500, overflow: 'auto', fontSize: 13, lineHeight: 1.6,
        whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0,
      }}>{record.output || '暂无输出内容'}</pre>
    </Modal>
  )
}

export default observer(function () {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [outputRecord, setOutputRecord] = useState(null);
  const record = S.record;

  useEffect(() => {
    const params = {task_id: record.id};
    if (record.latest_batch_id) params.batch_id = record.latest_batch_id;
    http.get('/api/exec/inspect/result/', {params})
      .then(res => setResults(res))
      .finally(() => setLoading(false));
  }, []);

  const total = results.length;
  const success = results.filter(r => r.status === 'success').length;
  const warning = results.filter(r => r.status === 'warning').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const pending = results.filter(r => r.status === 'pending' || r.status === 'running').length;
  const passRate = total > 0 ? Math.round(success / total * 1000) / 10 : 0;
  const passColor = passRate === 100 ? 'var(--color-green-600)' : (passRate >= 60 ? 'var(--color-gold-500)' : 'var(--color-red-600)');
  const isNormal = warning === 0 && errorCount === 0;

  const hostMap = {};
  results.forEach(r => {
    if (!hostMap[r.host_id]) hostMap[r.host_id] = {name: r.host_name, items: []};
    hostMap[r.host_id].items.push(r);
  });
  const hosts = Object.values(hostMap).map(info => {
    const hTotal = info.items.length;
    const hSuccess = info.items.filter(r => r.status === 'success').length;
    const hWarning = info.items.filter(r => r.status === 'warning').length;
    const hError = info.items.filter(r => r.status === 'error').length;
    const hPassRate = hTotal > 0 ? Math.round(hSuccess / hTotal * 1000) / 10 : 0;
    return {...info, hSuccess, hWarning, hError, hTotal, hPassRate};
  });

  function handleDownload() {
    const params = new URLSearchParams({task_id: record.id, 'x-token': X_TOKEN});
    if (record.latest_batch_id) params.set('batch_id', record.latest_batch_id);
    window.open(`/api/exec/inspect/report/?${params.toString()}`, '_blank');
  }

  return (
    <Modal
      open
      width={1000}
      title={<Space><FileTextOutlined/>巡检报告 - {record.name}</Space>}
      onCancel={() => S.reportVisible = false}
      footer={
        <Space>
          <Button icon={<DownloadOutlined/>} onClick={handleDownload}>下载HTML</Button>
          <Button onClick={() => S.reportVisible = false}>关闭</Button>
        </Space>
      }
      styles={{body: {maxHeight: '70vh', overflow: 'auto'}}}>
      {loading ? (
        <div style={{padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)'}}>加载中...</div>
      ) : results.length === 0 ? (
        <Empty description="暂无巡检结果"/>
      ) : (
        <>
          <Row gutter={12} style={{marginBottom: 16}}>
            <Col span={4}><Card size="small"><Statistic title="全部" value={total}/></Card></Col>
            <Col span={5}><Card size="small"><Statistic title="正常" value={success} valueStyle={{color: 'var(--color-green-600)'}}/></Card></Col>
            <Col span={5}><Card size="small"><Statistic title="告警" value={warning} valueStyle={{color: 'var(--color-gold-500)'}}/></Card></Col>
            <Col span={5}><Card size="small"><Statistic title="失败" value={errorCount} valueStyle={{color: 'var(--color-red-600)'}}/></Card></Col>
            <Col span={5}><Card size="small"><Statistic title="待执行" value={pending} valueStyle={{color: 'var(--color-text-secondary)'}}/></Card></Col>
          </Row>

          <div style={{marginBottom: 16}}>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 4}}>
              <span style={{fontSize: 13, color: '#595959'}}>通过率</span>
              <span style={{color: passColor, fontWeight: 600, fontSize: 13}}>{passRate}%</span>
            </div>
            <Progress percent={passRate} strokeColor={passColor} showInfo={false}/>
          </div>

          <Descriptions size="small" column={4} bordered style={{marginBottom: 16}}>
            <Descriptions.Item label="巡检状态">
              <Tag color={isNormal ? 'success' : 'error'}>{isNormal ? '正常' : '异常'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="目标主机">{hosts.length} 台</Descriptions.Item>
            <Descriptions.Item label="巡检项数">{new Set(results.map(r => r.item_id)).size} 项</Descriptions.Item>
            <Descriptions.Item label="任务描述">{record.desc || '-'}</Descriptions.Item>
          </Descriptions>

          {hosts.map((host, idx) => (
            <Card
              key={idx}
              size="small"
              style={{marginBottom: 12}}
              title={
                <Space>
                  <span style={{fontWeight: 600}}>{host.name}</span>
                  <span style={{fontSize: 12, color: 'var(--color-text-secondary)'}}>{host.hPassRate}%</span>
                  <Tag color="success">正常 {host.hSuccess}</Tag>
                  {host.hWarning > 0 && <Tag color="warning">告警 {host.hWarning}</Tag>}
                  {host.hError > 0 && <Tag color="error">失败 {host.hError}</Tag>}
                </Space>
              }>
              <Table
                rowKey="id"
                size="small"
                dataSource={host.items}
                pagination={false}
                columns={[
                  {title: '巡检项', dataIndex: 'item_name', width: 150},
                  {title: '状态', dataIndex: 'status', width: 80, render: v => {
                    const s = statusMap[v] || statusMap.pending;
                    return <Tag color={s.color}>{s.text}</Tag>;
                  }},
                  {title: '实际值', dataIndex: 'actual_value', width: 80, render: v => v !== null && v !== undefined ? v : '-'},
                  {title: '匹配内容', dataIndex: 'matched', width: 120, ellipsis: true, render: v => v || '-'},
                  {title: '退出码', dataIndex: 'exit_code', width: 70, render: v => v !== null && v !== undefined ? v : '-'},
                  {title: '耗时', dataIndex: 'duration', width: 70, render: v => v ? `${v}s` : '-'},
                  {title: '输出', width: 70, render: (_, r) => r.output ? (
                    <Button type="link" size="small" onClick={() => setOutputRecord(r)}>查看</Button>
                  ) : '-'},
                ]}/>
            </Card>
          ))}
        </>
      )}
      {outputRecord && <OutputModal record={outputRecord} onClose={() => setOutputRecord(null)}/>}
    </Modal>
  )
})