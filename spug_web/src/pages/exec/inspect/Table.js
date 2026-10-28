import React from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Table, Modal, Tooltip, Space } from 'antd';
import {
  PlusOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  CheckCircleFilled,
  ExclamationCircleFilled,
  CloseCircleFilled,
  ClockCircleFilled,
  SyncOutlined,
  ScheduleOutlined,
  SafetyCertificateOutlined,
  DesktopOutlined,
  UnorderedListOutlined,
  PauseCircleFilled,
  EditOutlined,
  DeleteOutlined,
  ProfileOutlined,
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

function Capsule({ icon, count, unit }) {
  return (
    <span className={styles.capsule}>
      {icon}
      <span className={styles.capsuleNum}>{count}</span>
      <span className={styles.capsuleUnit}>{unit}</span>
    </span>
  );
}

function formatScheduleRule(trigger, args) {
  if (!trigger) return null;
  if (trigger === 'cron') {
    let parsed;
    try { parsed = typeof args === 'string' ? JSON.parse(args) : args; } catch { parsed = null; }
    return parsed?.rule || 'Cron';
  }
  if (trigger === 'interval') {
    const seconds = parseInt(args);
    if (isNaN(seconds)) return '间隔执行';
    if (seconds >= 86400 && seconds % 86400 === 0) return `每 ${seconds / 86400} 天`;
    if (seconds >= 3600 && seconds % 3600 === 0) return `每 ${seconds / 3600} 小时`;
    if (seconds >= 60 && seconds % 60 === 0) return `每 ${seconds / 60} 分钟`;
    return `每 ${seconds} 秒`;
  }
  if (trigger === 'date') return args || '一次性';
  return null;
}

function ScheduleCell({ active, trigger, args }) {
  if (!trigger) return <span className={styles.scheduleEmpty}>未配置</span>;
  const rule = formatScheduleRule(trigger, args);
  if (!active) {
    return (
      <Tooltip title={`已配置: ${rule}（已禁用）`}>
        <span className={`${styles.scheduleBadge} ${styles.scheduleDisabled}`}>
          <PauseCircleFilled style={{ fontSize: 10 }} /> 已禁用
        </span>
      </Tooltip>
    );
  }
  const label = trigger === 'cron' ? 'Cron' : trigger === 'interval' ? '间隔' : '定时';
  return (
    <Tooltip title={`${label}: ${rule}`}>
      <span className={`${styles.scheduleBadge} ${styles.scheduleActive}`}>
        <SyncOutlined style={{ fontSize: 10 }} /> {rule && rule.length <= 12 ? rule : label}
      </span>
    </Tooltip>
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
        <Table.Column
          title="任务名称"
          dataIndex="name"
          width={200}
          ellipsis={{ showTitle: true }}
          render={(name) => (
            <Space size={6} className={styles.nameCell}>
              <SafetyCertificateOutlined className={styles.nameIcon} />
              <span className={styles.nameText}>{name}</span>
            </Space>
          )}
        />
        <Table.Column
          title="巡检项"
          dataIndex="items"
          width={110}
          align="center"
          render={v => <Capsule icon={<UnorderedListOutlined style={{ fontSize: 12 }} />} count={v ? v.length : 0} unit="项" />}
        />
        <Table.Column
          title="目标主机"
          dataIndex="host_ids"
          width={110}
          align="center"
          render={v => <Capsule icon={<DesktopOutlined style={{ fontSize: 12 }} />} count={v ? v.length : 0} unit="台" />}
        />
        <Table.Column
          title="最近状态"
          dataIndex="latest_status"
          width={120}
          align="center"
          render={v => <StatusTag status={v} />}
        />
        <Table.Column
          title="定时"
          dataIndex="schedule_active"
          width={110}
          align="center"
          render={(active, record) => (
            <ScheduleCell
              active={active}
              trigger={record.schedule_trigger}
              args={record.schedule_args}
            />
          )}
        />
        <Table.Column
          title="最近执行"
          dataIndex="latest_run_at"
          width={180}
          render={v => v
            ? <span className={styles.time}>{v}</span>
            : <span className={styles.timeEmpty}>未执行</span>}
        />
        {/* <Table.Column
          ellipsis={{ showTitle: true }}
          title="描述"
          dataIndex="desc"
          width={180}
          render={v => v
            ? <Tooltip title={v} placement="topLeft"><span className={styles.desc}>{v}</span></Tooltip>
            : <span className={styles.timeEmpty}>-</span>}
        /> */}
        {hasPermission('exec.inspect.do|exec.inspect.view|exec.inspect.edit|exec.inspect.del') && (
          <Table.Column
            title="操作"
            width={200}
            fixed="right"
            align="center"
            render={info => (
              <Action>
                <Tooltip title="执行">
                  <Action.Button auth="exec.inspect.do" icon={<ThunderboltOutlined />} onClick={() => this.handleRun(info)} />
                </Tooltip>
                <Tooltip title="结果">
                  <Action.Button auth="exec.inspect.view" icon={<ProfileOutlined />} onClick={() => store.showResult(info)} />
                </Tooltip>
                <Tooltip title="定时">
                  <Action.Button auth="exec.inspect.edit" icon={<ScheduleOutlined />} onClick={() => { store.record = info; store.scheduleVisible = true; }} />
                </Tooltip>
                <Tooltip title="报告">
                  <Action.Button auth="exec.inspect.view" icon={<FileTextOutlined />} onClick={() => this.handleReport(info)} />
                </Tooltip>
                <Tooltip title="编辑">
                  <Action.Button auth="exec.inspect.edit" icon={<EditOutlined />} onClick={() => store.showForm(info)} />
                </Tooltip>
                <Tooltip title="删除">
                  <Action.Button danger auth="exec.inspect.del" icon={<DeleteOutlined />} onClick={() => this.handleDelete(info)} />
                </Tooltip>
              </Action>
            )}
          />
        )}
      </TableCard>
    );
  }
}

export default ComTable;
