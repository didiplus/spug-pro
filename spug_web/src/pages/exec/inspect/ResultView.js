import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { Modal, Table, Tag, Statistic, Row, Col, Card, Empty, Button, Space } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { http } from 'libs';
import S from './store';

const statusMap = {
  success: {color: 'success', text: '正常'},
  warning: {color: 'warning', text: '告警'},
  error: {color: 'error', text: '失败'},
  pending: {color: 'default', text: '待执行'},
  running: {color: 'processing', text: '执行中'},
};

function OutputView({resultId, hostName, itemName, onClose}) {
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    http.get('/api/exec/inspect/result/', {params: {id: resultId}})
      .then(res => {
        if (res && res.length > 0) {
          setOutput(res[0].output || '暂无输出内容');
        } else {
          setOutput('暂无输出内容');
        }
      })
      .finally(() => setLoading(false))
  }, [resultId]);

  return (
    <Modal
      open
      width={750}
      title={`执行输出 - ${hostName} / ${itemName}`}
      onCancel={onClose}
      footer={null}>
      <pre style={{
        background: '#1e1e1e',
        color: '#d4d4d4',
        padding: 16,
        borderRadius: 6,
        maxHeight: 500,
        overflow: 'auto',
        fontSize: 13,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        margin: 0,
      }}>{loading ? '加载中...' : output}</pre>
    </Modal>
  )
}

export default observer(function () {
  const [results, setResults] = useState([]);
  const [outputRecord, setOutputRecord] = useState(null);

  useEffect(() => {
    const params = { task_id: S.record.id };
    if (S.record.latest_batch_id) params.batch_id = S.record.latest_batch_id;
    http.get('/api/exec/inspect/result/', { params })
      .then(res => setResults(res))
  }, []);

  const counts = {
    total: results.length,
    success: results.filter(r => r.status === 'success').length,
    warning: results.filter(r => r.status === 'warning').length,
    error: results.filter(r => r.status === 'error').length,
  };

  return (
    <Modal
      open
      width={1000}
      title={
        <Space>
          <span>巡检结果 - {S.record.name}</span>
          <Button size="small" icon={<FileTextOutlined/>} onClick={() => S.showReport(S.record)} disabled={results.length === 0}>
            生成报告
          </Button>
        </Space>
      }
      onCancel={() => S.resultVisible = false}
      footer={null}>
      <Row gutter={16} style={{marginBottom: 24}}>
        <Col span={6}>
          <Card><Statistic title="全部" value={counts.total}/></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="正常" value={counts.success} valueStyle={{color: 'var(--color-green-600)'}}/></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="告警" value={counts.warning} valueStyle={{color: 'var(--color-gold-500)'}}/></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="失败" value={counts.error} valueStyle={{color: 'var(--color-red-600)'}}/></Card>
        </Col>
      </Row>
      {results.length === 0 ? (
        <Empty description="暂无巡检结果"/>
      ) : (
        <Table
          rowKey="id"
          size="small"
          dataSource={results}
          scroll={{ x: 800 }}
          pagination={{pageSize: 20, showTotal: total => `共 ${total} 条`}}>
          <Table.Column title="主机" dataIndex="host_name" width={120}/>
          <Table.Column title="巡检项" dataIndex="item_name" width={150}/>
          <Table.Column title="状态" dataIndex="status" width={80} render={v => {
            const s = statusMap[v] || statusMap.pending;
            return <Tag color={s.color}>{s.text}</Tag>;
          }}/>
          <Table.Column title="实际值" dataIndex="actual_value" width={80} render={v => v !== null && v !== undefined ? v : '-'}/>
          <Table.Column title="退出码" dataIndex="exit_code" width={70} render={v => v !== null && v !== undefined ? v : '-'}/>
          <Table.Column title="耗时" dataIndex="duration" width={70} render={v => v ? `${v}s` : '-'}/>
          <Table.Column title="执行时间" dataIndex="run_at" width={160}/>
          <Table.Column title="操作" width={80} render={record => (
            <Button type="link" size="small" onClick={() => setOutputRecord(record)}>输出</Button>
          )}/>
        </Table>
      )}
      {outputRecord && (
        <OutputView
          resultId={outputRecord.id}
          hostName={outputRecord.host_name}
          itemName={outputRecord.item_name}
          onClose={() => setOutputRecord(null)}/>
      )}

    </Modal>
  )
})
