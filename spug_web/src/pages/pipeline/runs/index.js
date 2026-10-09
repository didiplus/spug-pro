import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { EyeOutlined } from '@ant-design/icons';
import { Table, Tag, Select } from 'antd';
import { AuthDiv, Breadcrumb, TableCard, Action } from 'components';
import { http, history } from 'libs';
import moment from 'moment';
import style from './index.module.less';

const STATUS_MAP = {
  pending: { color: 'default', text: '待执行' },
  running: { color: 'processing', text: '执行中' },
  success: { color: 'success', text: '成功' },
  failed: { color: 'error', text: '失败' },
  canceled: { color: 'warning', text: '已取消' },
};

function PipelineRuns() {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState(undefined);

  useEffect(() => {
    fetchRecords();
  }, [page, statusFilter]);

  function fetchRecords() {
    setLoading(true);
    const params = { page, page_size: 20 };
    if (statusFilter) params.status = statusFilter;
    http.get('/api/pipeline/runs/', { params }).then(res => {
      setRecords(res.data);
      setTotal(res.total);
    }).finally(() => setLoading(false));
  }

  return (
    <AuthDiv auth="pipeline.pipeline.view|pipeline.pipeline.run">
      <Breadcrumb items={['首页', '流水线', '执行历史']} />
      <div className={style.container}>
        <TableCard
          loading={loading}
          actions={[
            <Select
              key="filter"
              allowClear
              placeholder="状态筛选"
              style={{ width: 120 }}
              value={statusFilter}
              onChange={v => { setStatusFilter(v); setPage(1); }}
              options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.text }))}
            />
          ]}
        >
          <Table
            rowKey="id"
            dataSource={records}
            pagination={{
              current: page,
              total,
              pageSize: 20,
              onChange: setPage,
            }}
          >
            <Table.Column title="ID" dataIndex="id" width={70} />
            <Table.Column title="流水线" dataIndex="pipeline_name" width={200} />
            <Table.Column title="状态" dataIndex="status" width={100} render={status => {
              const cfg = STATUS_MAP[status] || { color: 'default', text: status };
              return <Tag color={cfg.color}>{cfg.text}</Tag>;
            }} />
            <Table.Column title="触发方式" dataIndex="trigger_type" width={100} />
            <Table.Column title="触发用户" dataIndex="trigger_user_name" width={120} render={v => v || '-'} />
            <Table.Column title="耗时" dataIndex="duration" width={80} render={v => `${v || 0}s`} />
            <Table.Column title="开始时间" dataIndex="started_at" width={160} render={v => v ? moment(v).format('YYYY-MM-DD HH:mm:ss') : '-'} />
            <Table.Column title="完成时间" dataIndex="finished_at" width={160} render={v => v ? moment(v).format('YYYY-MM-DD HH:mm:ss') : '-'} />
            <Table.Column title="操作" width={100} render={info => (
              <Action>
                <Action.Button icon={<EyeOutlined />} onClick={() => history.push(`/pipeline/run-detail/${info.id}`)}>详情</Action.Button>
              </Action>
            )} />
          </Table>
        </TableCard>
      </div>
    </AuthDiv>
  );
}

export default observer(PipelineRuns);