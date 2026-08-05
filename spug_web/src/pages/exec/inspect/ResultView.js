import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { Modal, Table, Tag, Statistic, Row, Col, Card, Empty, Button, Space } from 'antd';
import { FileTextOutlined, DownloadOutlined, EyeOutlined } from '@ant-design/icons';
import { http, X_TOKEN } from 'libs';
import S from './store';

const statusMap = {
  success: {color: 'success', text: '正常'},
  warning: {color: 'warning', text: '告警'},
  error: {color: 'error', text: '失败'},
  pending: {color: 'default', text: '待执行'},
  running: {color: 'processing', text: '执行中'},
};

function OutputView({resultId, hostName, onClose}) {
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
      title={`执行输出 - ${hostName}`}
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

function ReportView({taskId, taskName, onClose}) {
  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/exec/inspect/report/?task_id=${taskId}`, {
      headers: {'X-Token': X_TOKEN}
    })
      .then(res => {
        if (!res.ok) throw new Error(`请求失败: ${res.status}`);
        return res.text();
      })
      .then(text => setHtml(text))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [taskId]);

  function handleDownload() {
    const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `巡检报告_${taskName}_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleOpenNew() {
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }

  return (
    <Modal
      open
      width={1000}
      title={
        <Space>
          <FileTextOutlined/>
          巡检报告 - {taskName}
          {!loading && !error && (
            <>
              <Button size="small" icon={<EyeOutlined/>} onClick={handleOpenNew}>新窗口查看</Button>
              <Button size="small" icon={<DownloadOutlined/>} onClick={handleDownload}>下载HTML</Button>
            </>
          )}
        </Space>
      }
      onCancel={onClose}
      footer={null}
      styles={{body: {padding: 0, maxHeight: '70vh', overflow: 'auto'}}}>
      {loading ? (
        <div style={{padding: 40, textAlign: 'center', color: '#8c8c8c'}}>生成报告中...</div>
      ) : error ? (
        <div style={{padding: 40, textAlign: 'center', color: '#ff4d4f'}}>报告生成失败: {error}</div>
      ) : (
        <div dangerouslySetInnerHTML={{__html: html}}/>
      )}
    </Modal>
  )
}

export default observer(function () {
  const [results, setResults] = useState([]);
  const [outputRecord, setOutputRecord] = useState(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    http.get('/api/exec/inspect/result/', {params: {task_id: S.record.id}})
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
      width={900}
      title={
        <Space>
          <span>巡检结果 - {S.record.name}</span>
          <Button size="small" icon={<FileTextOutlined/>} onClick={() => setShowReport(true)} disabled={results.length === 0}>
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
          <Card><Statistic title="正常" value={counts.success} valueStyle={{color: '#52c41a'}}/></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="告警" value={counts.warning} valueStyle={{color: '#faad14'}}/></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="失败" value={counts.error} valueStyle={{color: '#ff4d4f'}}/></Card>
        </Col>
      </Row>
      {results.length === 0 ? (
        <Empty description="暂无巡检结果"/>
      ) : (
        <Table
          rowKey="id"
          size="small"
          dataSource={results}
          pagination={{pageSize: 10, showTotal: total => `共 ${total} 条`}}>
          <Table.Column title="主机" dataIndex="host_name"/>
          <Table.Column title="状态" dataIndex="status" render={v => {
            const s = statusMap[v] || statusMap.pending;
            return <Tag color={s.color}>{s.text}</Tag>;
          }}/>
          <Table.Column title="退出码" dataIndex="exit_code" render={v => v !== null && v !== undefined ? v : '-'}/>
          <Table.Column title="耗时" dataIndex="duration" render={v => v ? `${v}s` : '-'}/>
          <Table.Column title="执行时间" dataIndex="run_at"/>
          <Table.Column title="操作" width={100} render={record => (
            <Button type="link" size="small" onClick={() => setOutputRecord(record)}>查看输出</Button>
          )}/>
        </Table>
      )}
      {outputRecord && (
        <OutputView
          resultId={outputRecord.id}
          hostName={outputRecord.host_name}
          onClose={() => setOutputRecord(null)}/>
      )}
      {showReport && (
        <ReportView
          taskId={S.record.id}
          taskName={S.record.name}
          onClose={() => setShowReport(false)}/>
      )}
    </Modal>
  )
})
