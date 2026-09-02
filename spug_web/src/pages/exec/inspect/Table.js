import React from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Table, Modal, Tooltip } from 'antd';
import {
  PlusOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  CheckCircleFilled,
  ExclamationCircleFilled,
  CloseCircleFilled,
  ClockCircleFilled,
  SyncOutlined,
} from '@ant-design/icons';
import { http, hasPermission } from 'libs';
import { Action, TableCard, AuthButton } from 'components';
import store from './store';
import styles from './Table.module.css';

const STATUS_MAP = {
  success: { cls: styles.statusSuccess, icon: CheckCircleFilled, text: '正常' },
  warning: { cls: styles.statusWarning, icon: ExclamationCircleFilled, text: '告警' },
  error: { cls: styles.statusError, icon: CloseCircleFilled, text: '失败' },
  pending: { cls: styles.statusPending, icon: ClockCircleFilled, text: '待执行' },
  running: { cls: styles.statusRunning, icon: SyncOutlined, text: '执行中' },
};

function StatusTag({ status }) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.pending;
  const Icon = cfg.icon;
  return (
    <span className={`${styles.statusTag} ${cfg.cls}`}>
      <Icon className={styles.statusDot} style={{ fontSize: 10 }} />
      {cfg.text}
    </span>
  );
}

function CountCell({ count, unit }) {
  return (
    <span className={styles.count}>
      <span className={styles.countNum}>{count}</span>
      <span className={styles.countUnit}>{unit}</span>
    </span>
  );
}

@observer
class ComTable extends React.Component {
  componentDidMount() {
    store.fetchRecords();
  }

  handleDelete = (text) => {
    Modal.confirm({
      title: '删除确认',
      content: `确定要删除【${text.name}】？删除后不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        return http.delete('/api/exec/inspect/task/', { params: { id: text.id } })
          .then(() => {
            message.success('删除成功');
            store.fetchRecords();
          });
      },
    });
  };

  handleRun = (record) => {
    Modal.confirm({
      title: '执行确认',
      content: `确定要执行巡检任务【${record.name}】？`,
      okText: '执行',
      cancelText: '取消',
      onOk: () => {
        return http.post('/api/exec/inspect/run/', { task_id: record.id })
          .then(() => {
            message.success('巡检任务已提交执行');
            store.fetchRecords();
            this._pollStatus();
          });
      },
    });
  };

  handleReport = (record) => {
    store.showReport(record);
  };

  _pollStatus = () => {
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      store.fetchRecords();
      const hasRunning = store.records.some(r => r.latest_status === 'running' || r.latest_status === 'pending');
      if (!hasRunning || count >= 30) {
        clearInterval(timer);
      }
    }, 3000);
  };

  render() {
    return (
      <TableCard
        tKey="eit"
        title="巡检任务"
        rowKey="id"
        loading={store.isFetching}
        dataSource={store.dataSource}
        onReload={store.fetchRecords}
        actions={[
          <AuthButton
            auth="exec.inspect.add"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => store.showForm()}
          >新建任务</AuthButton>,
          <TableCard.Search
            key="search"
            keys={['name/任务名称']}
            onChange={(key, value) => store.f_name = value}
          />,
        ]}
        pagination={{
          showSizeChanger: true,
          showLessItems: true,
          showTotal: total => `共 ${total} 条`,
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
      >
        <Table.Column title="任务名称" dataIndex="name" width={180} ellipsis={{ showTitle: true }} />
        <Table.Column
          title="巡检项"
          dataIndex="items"
          width={120}
          align="center"
          render={v => <CountCell count={v ? v.length : 0} unit="项" />}
        />
        <Table.Column
          title="目标主机"
          dataIndex="host_ids"
          width={150}
          align="center"
          render={v => <CountCell count={v ? v.length : 0} unit="台" />}
        />
        <Table.Column
          title="最近状态"
          dataIndex="latest_status"
          width={150}
          align="center"
          render={v => <StatusTag status={v} />}
        />
        <Table.Column
          title="执行时间"
          dataIndex="latest_run_at"
          width={200}
          render={v => v
            ? <span className={styles.time}>{v}</span>
            : <span className={styles.timeEmpty}>-</span>}
        />
        <Table.Column
          ellipsis={{ showTitle: true }}
          title="描述"
          dataIndex="desc"
          render={v => v
            ? <Tooltip title={v} placement="topLeft"><span className={styles.desc}>{v}</span></Tooltip>
            : <span className={styles.timeEmpty}>-</span>}
        />
        {hasPermission('exec.inspect.do|exec.inspect.view|exec.inspect.edit|exec.inspect.del') && (
          <Table.Column
            title="操作"
            width={320}
            fixed="right"
            render={info => (
              <Action>
                <Action.Button auth="exec.inspect.do" icon={<ThunderboltOutlined />} onClick={() => this.handleRun(info)}>执行</Action.Button>
                <Action.Button auth="exec.inspect.view" onClick={() => store.showResult(info)}>结果</Action.Button>
                <Action.Button auth="exec.inspect.view" icon={<FileTextOutlined />} onClick={() => this.handleReport(info)}>报告</Action.Button>
                <Action.Button auth="exec.inspect.edit" onClick={() => store.showForm(info)}>编辑</Action.Button>
                <Action.Button danger auth="exec.inspect.del" onClick={() => this.handleDelete(info)}>删除</Action.Button>
              </Action>
            )}
          />
        )}
      </TableCard>
    );
  }
}

export default ComTable;
