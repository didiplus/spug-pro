import React, { useState, useEffect } from 'react';
import { Drawer, Table, Button, Modal, Tag, Space, Typography, Empty, Spin, Input, Popconfirm } from 'antd';
import { HistoryOutlined, EyeOutlined, DiffOutlined, RollbackOutlined, DeleteOutlined } from '@ant-design/icons';
import { message } from 'libs/message';
import { http } from 'libs';
import { ACEditor } from 'components';

const { Text, Paragraph } = Typography;

export default function VersionHistory({ playbookId, onClose, onRollback }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewVersion, setViewVersion] = useState(null);
  const [viewContent, setViewContent] = useState('');
  const [diffVisible, setDiffVisible] = useState(false);
  const [diffText, setDiffText] = useState('');
  const [diffLoading, setDiffLoading] = useState(false);

  useEffect(() => {
    fetchVersions();
  }, []);

  function fetchVersions() {
    setLoading(true);
    http.get('/api/playbook/versions/', {params: {playbook_id: playbookId}})
      .then(res => setVersions(res))
      .finally(() => setLoading(false));
  }

  function handleView(record) {
    http.get(`/api/playbook/versions/${record.id}/`)
      .then(res => {
        setViewContent(res.content);
        setViewVersion(res);
      })
  }

  function handleDiff(record) {
    setDiffLoading(true);
    setDiffVisible(true);
    http.get('/api/playbook/diff/', {params: {playbook_id: playbookId, version_id: record?.id}})
      .then(res => setDiffText(res.diff))
      .finally(() => setDiffLoading(false))
  }

  function handleRollback(record) {
    http.post('/api/playbook/rollback/', {playbook_id: playbookId, version_id: record.id})
      .then(res => {
        message.success(res.message || '回滚成功');
        onRollback && onRollback();
        fetchVersions();
      })
  }

  const columns = [
    {
      title: '版本', width: 70, dataIndex: 'version', align: 'center',
      render: v => <Tag color="blue">v{v}</Tag>
    },
    {title: '保存时间', width: 170, dataIndex: 'created_at'},
    {title: '操作人', width: 100, dataIndex: 'created_by_name'},
    {title: '内容大小', width: 100, dataIndex: 'content_length', align: 'center',
      render: v => <Text type="secondary">{v > 1024 ? `${(v/1024).toFixed(1)} KB` : `${v} B`}</Text>},
    {title: '变更说明', ellipsis: true, dataIndex: 'change_desc',
      render: v => v || <Text type="secondary">-</Text>},
    {title: '操作', width: 200, align: 'center', render: (_, record) => (
      <Space size={4}>
        <Button size="small" type="link" icon={<EyeOutlined/>} onClick={() => handleView(record)}>查看</Button>
        <Button size="small" type="link" icon={<DiffOutlined/>} onClick={() => handleDiff(record)}>对比</Button>
        <Popconfirm title={`确定回滚至 v${record.version}？当前内容将被覆盖。`} onConfirm={() => handleRollback(record)}>
          <Button size="small" type="link" icon={<RollbackOutlined/>}>回滚</Button>
        </Popconfirm>
      </Space>
    )},
  ];

  return (
    <Drawer
      open
      width={720}
      title={<Space><HistoryOutlined/> 版本历史</Space>}
      onClose={onClose}
      destroyOnClose>
      <div style={{marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <Text type="secondary">每次保存修改时自动创建版本快照，可随时回滚</Text>
        <Button size="small" icon={<DiffOutlined/>} onClick={() => handleDiff(null)}>与最新版本对比</Button>
      </div>
      <Spin spinning={loading}>
        {versions.length === 0 ? (
          <Empty description="暂无历史版本" style={{marginTop: 80}}/>
        ) : (
          <Table
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={versions}
            pagination={{pageSize: 10, showSizeChanger: true, showTotal: t => `共 ${t} 个版本`}}
          />
        )}
      </Spin>

      {viewVersion && (
        <Modal
          open
          width={800}
          title={`版本 v${viewVersion.version} 内容`}
          onCancel={() => setViewVersion(null)}
          footer={null}
          destroyOnClose>
          <Space style={{marginBottom: 12}}>
            <Text type="secondary">保存时间: {viewVersion.created_at}</Text>
            <Text type="secondary">操作人: {viewVersion.created_by_name}</Text>
          </Space>
          <ACEditor mode="yaml" value={viewContent} height="400px" width="100%" readOnly/>
        </Modal>
      )}

      <Modal
        open={diffVisible}
        width={800}
        title="版本对比 (Unified Diff)"
        onCancel={() => setDiffVisible(false)}
        footer={null}
        destroyOnClose>
        <Spin spinning={diffLoading}>
          <pre style={{
            background: '#1e1e1e', color: '#d4d4d4', padding: 16,
            borderRadius: 8, maxHeight: 500, overflow: 'auto',
            fontSize: 13, fontFamily: '"Cascadia Code", "Fira Code", monospace',
            whiteSpace: 'pre-wrap', lineHeight: 1.5,
          }}>
            {diffText.split('\n').map((line, i) => {
              let color = '#d4d4d4';
              if (line.startsWith('+') && !line.startsWith('+++')) color = '#98c379';
              else if (line.startsWith('-') && !line.startsWith('---')) color = '#e06c75';
              else if (line.startsWith('@')) color = '#61afef';
              return <div key={i} style={{color}}>{line || ' '}</div>;
            })}
          </pre>
        </Spin>
      </Modal>
    </Drawer>
  );
}