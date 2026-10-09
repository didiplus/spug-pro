import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { PlusOutlined, ThunderboltOutlined, EditOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons';
import { Button, Modal, Tag, Table, message } from 'antd';
import { AuthDiv, AuthButton, Breadcrumb, Action, TableCard } from 'components';
import { http, history, hasPermission } from 'libs';
import style from './index.module.less';

const STATUS_MAP = {
  '-3': { color: 'error', text: '发布异常' },
  '0': { color: 'default', text: '待执行' },
  '1': { color: 'processing', text: '执行中' },
  '3': { color: 'success', text: '成功' },
  '4': { color: 'warning', text: '灰度成功' },
};

function PipelineList() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRecords();
  }, []);

  function fetchRecords() {
    setLoading(true);
    http.get('/api/pipeline/pipelines/').then(res => {
      setRecords(res);
    }).finally(() => setLoading(false));
  }

  function handleRun(record) {
    http.post('/api/pipeline/runs/', { pipeline_id: record.id }).then(res => {
      history.push(`/pipeline/run-detail/${res.run_id}`);
    });
  }

  function handleEdit(record) {
    history.push(`/pipeline/editor/${record.id}`);
  }

  function handleDelete(record) {
    Modal.confirm({
      title: '删除确认',
      content: `确定要删除流水线 "${record.name}" 吗？`,
      onOk: () => {
        http.delete('/api/pipeline/pipelines/', { params: { id: record.id } }).then(() => {
          message.success('删除成功');
          fetchRecords();
        });
      }
    });
  }

  function handleCopy(record) {
    http.post('/api/pipeline/pipelines/', {
      name: `${record.name}_副本`,
      desc: record.desc,
      host_ids: record.host_ids,
      server_actions: record.server_actions,
      host_actions: record.host_actions,
      is_parallel: record.is_parallel,
      is_audit: record.is_audit,
      rst_notify: record.rst_notify,
      variables: record.variables,
    }).then(() => {
      message.success('复制成功');
      fetchRecords();
    });
  }

  return (
    <AuthDiv auth="pipeline.pipeline.view|pipeline.pipeline.run">
      <Breadcrumb items={['首页', '流水线', '流水线列表']} />
      <div className={style.container}>
        <TableCard
          loading={loading}
          actions={[
            <AuthButton auth="pipeline.pipeline.add" key="add" type="primary" icon={<PlusOutlined />} onClick={() => history.push('/pipeline/editor/0')}>新建流水线</AuthButton>
          ]}
        >
          <Table
            rowKey="id"
            dataSource={records}
            pagination={{ pageSize: 20, showSizeChanger: true }}
          >
            <Table.Column title="流水线名称" dataIndex="name" width={200} render={(text, record) => (
              <a onClick={() => handleEdit(record)}>{text}</a>
            )} />
            <Table.Column title="描述" dataIndex="desc" ellipsis width={250} />
            <Table.Column title="状态" dataIndex="is_active" width={80} render={v => v ? <Tag color="success">启用</Tag> : <Tag color="default">禁用</Tag>} />
            <Table.Column title="最近状态" dataIndex="last_status" width={100} render={status => {
              if (!status) return '-';
              const cfg = STATUS_MAP[status] || { color: 'default', text: status };
              return <Tag color={cfg.color}>{cfg.text}</Tag>;
            }} />
            <Table.Column title="执行次数" dataIndex="run_count" width={90} render={v => v || 0} />
            <Table.Column title="最后执行" dataIndex="last_run_at" width={180} render={text => text || '-'} />
            {hasPermission('pipeline.pipeline.run|pipeline.pipeline.edit|pipeline.pipeline.del') && (
              <Table.Column title="操作" width={200} render={info => (
                <Action>
                  <Action.Button auth="pipeline.pipeline.run" icon={<ThunderboltOutlined />} onClick={() => handleRun(info)}>执行</Action.Button>
                  <Action.Button auth="pipeline.pipeline.edit" icon={<EditOutlined />} onClick={() => handleEdit(info)}>编辑</Action.Button>
                  <Action.Button auth="pipeline.pipeline.add" icon={<CopyOutlined />} onClick={() => handleCopy(info)}>复制</Action.Button>
                  <Action.Button danger auth="pipeline.pipeline.del" icon={<DeleteOutlined />} onClick={() => handleDelete(info)}>删除</Action.Button>
                </Action>
              )} />
            )}
          </Table>
        </TableCard>
      </div>
    </AuthDiv>
  );
}

export default observer(PipelineList);
