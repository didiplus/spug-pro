import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { Modal, Card, Tag, Statistic, Row, Col, Table, Progress, Space, Button, Empty, Descriptions } from 'antd';
import { DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import { http, X_TOKEN } from 'libs';
import { message } from 'libs/message';
import S from './store';
import { statusMap, computeStats, groupByHost } from './utils';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {total, success, warning, errorCount, pending, passRate, passColor, isNormal} = computeStats(results);
  const hosts = groupByHost(results);

  async function handleDownload() {
    const params = {task_id: record.id};
    if (record.latest_batch_id) params.batch_id = record.latest_batch_id;
    try {
      const res = await fetch('/api/exec/inspect/report/?' + new URLSearchParams(params).toString(), {
        headers: {'x-token': X_TOKEN},
      });
      const html = await res.text();
      const blob = new Blob([html], {type: 'text/html'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inspect_report_${record.name}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error('下载报告失败');
    }
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
              <span style={{fontSize: 13, color: 'var(--color-text-secondary)'}}>通过率</span>
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
                  <span style={{fontSize: 12, color: 'var(--color-text-secondary)'}}>{host.passRate}%</span>
                  <Tag color="success">正常 {host.success}</Tag>
                  {host.warning > 0 && <Tag color="warning">告警 {host.warning}</Tag>}
                  {host.errorCount > 0 && <Tag color="error">失败 {host.errorCount}</Tag>}
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