import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Space, Switch, Tag, Popconfirm, Tooltip, Input, Select } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, SearchOutlined } from '@ant-design/icons';
import { http } from 'libs';
import { message as msg } from 'libs/message';
import { TableCard } from 'components';
import ScheduleBackupForm from './ScheduleBackupForm';

function formatTrigger(trigger, triggerArgs) {
  try {
    const args = typeof triggerArgs === 'string' ? JSON.parse(triggerArgs) : triggerArgs;
    const rule = args?.rule || '';
    if (trigger === 'interval') return `每 ${rule} 分钟`;
    return rule;
  } catch {
    return '-';
  }
}

function parseBackupConfig(command) {
  try {
    const c = JSON.parse(command || '{}');
    return {
      instance_id: c.instance_id,
      database: c.database || '全部库',
      mode: c.mode === 'incremental' ? '增量' : '全量',
    };
  } catch {
    return { instance_id: null, database: '-', mode: '-' };
  }
}

export default function ScheduleBackupTable() {
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [dbInstances, setDbInstances] = useState([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState(undefined);

  useEffect(() => {
    loadInstances();
    loadTasks();
    const timer = setInterval(loadTasks, 30000);
    return () => clearInterval(timer);
  }, []);

  function loadInstances() {
    http.get('/api/db/instances/', { params: { page: 1, page_size: 200 } })
      .then(res => setDbInstances(res.results || []));
  }

  const loadTasks = useCallback(() => {
    setTasksLoading(true);
    return http.get('/api/schedule/')
      .then(res => {
        const allTasks = res?.tasks || [];
        setTasks(allTasks.filter(t => t.interpreter === 'db_backup' && t.type === '数据库备份'));
      })
      .finally(() => setTasksLoading(false));
  }, []);

  const instanceMap = useMemo(() => {
    const map = {};
    dbInstances.forEach(i => { map[i.id] = `${i.name} (${i.host}:${i.port})`; });
    return map;
  }, [dbInstances]);

  const enrichedTasks = useMemo(() => {
    return tasks.map(t => {
      const cfg = parseBackupConfig(t.command);
      return {
        ...t,
        _instanceName: cfg.instance_id ? (instanceMap[cfg.instance_id] || `ID: ${cfg.instance_id}`) : '-',
        _backupConfig: `${cfg.database} / ${cfg.mode}`,
      };
    });
  }, [tasks, instanceMap]);

  const filteredTasks = useMemo(() => {
    return enrichedTasks.filter(t => {
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterActive !== undefined && t.is_active !== filterActive) return false;
      return true;
    });
  }, [enrichedTasks, search, filterActive]);

  function handleCreate() {
    setEditingTask(null);
    setFormVisible(true);
  }

  function handleEdit(task) {
    setEditingTask(task);
    setFormVisible(true);
  }

  function handleToggleActive(task, checked) {
    http.patch('/api/schedule/', { id: task.id, is_active: checked })
      .then(() => {
        msg.success(checked ? '任务已激活' : '任务已禁用');
        loadTasks();
      });
  }

  function handleDelete(task) {
    http.delete('/api/schedule/', { params: { id: task.id } })
      .then(() => {
        msg.success('删除成功');
        loadTasks();
      });
  }

  function handleFormSuccess() {
    loadTasks();
    setFormVisible(false);
    setEditingTask(null);
  }

  const columns = [
    {
      title: '任务名称', dataIndex: 'name', width: 150,
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: '备份对象', width: 180, ellipsis: true,
      render: (_, record) => (
        <Tooltip title={record._backupConfig}>
          <span>{record._instanceName}</span>
        </Tooltip>
      ),
    },
    {
      title: '备份配置', width: 110,
      render: (_, record) => record._backupConfig,
    },
    {
      title: '调度规则', width: 130,
      render: (_, record) => formatTrigger(record.trigger, record.trigger_args),
    },
    {
      title: '启用', dataIndex: 'is_active', width: 70, align: 'center',
      render: (active, record) => (
        <Switch
          size="small"
          checked={active}
          onChange={(checked) => handleToggleActive(record, checked)}
        />
      ),
      sorter: (a, b) => b.is_active - a.is_active,
    },
    {
      title: '最近执行', width: 100,
      render: (_, record) => {
        if (!record.latest_status_alias) return <Tag>未执行</Tag>;
        const status = record.latest_status;
        if (status === 0) return <Tag icon={<SyncOutlined spin />} color="processing">执行中</Tag>;
        if (status === 1) return <Tag icon={<CheckCircleOutlined />} color="success">成功</Tag>;
        return <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>;
      },
    },
    { title: '备注', dataIndex: 'desc', ellipsis: true, width: 120 },
    {
      title: '操作', width: 110, render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          {record.is_active ? (
            <Button type="link" danger size="small" icon={<DeleteOutlined />} disabled>删除</Button>
          ) : (
            <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record)}>
              <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      )
    },
  ];

  return (
    <>
      <TableCard
        title="定时备份任务"
        rowKey="id"
        columns={columns}
        dataSource={filteredTasks}
        loading={tasksLoading}
        actions={[
          <Space key="filter" size="small">
            <Input
              placeholder="搜索任务名称"
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 180 }}
              prefix={<SearchOutlined style={{ color: 'var(--color-text-tertiary)' }} />}
            />
            <Select
              placeholder="状态"
              allowClear
              value={filterActive}
              onChange={(v) => setFilterActive(v)}
              style={{ width: 90 }}
              options={[
                { value: true, label: '启用' },
                { value: false, label: '禁用' },
              ]}
            />
          </Space>,
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={handleCreate}>新建定时备份</Button>,
        ]}
        pagination={false}
        onReload={loadTasks}
        tKey="db_schedule_backups"
      />
      {formVisible && (
        <ScheduleBackupForm
          visible={formVisible}
          editingTask={editingTask}
          onCancel={() => { setFormVisible(false); setEditingTask(null); }}
          onSuccess={handleFormSuccess}
        />
      )}
    </>
  );
}