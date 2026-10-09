import React, { useEffect } from 'react';
import { observer } from 'mobx-react';
import { Table, Modal, Popconfirm, Tag, Space, Input, message, Tooltip, Switch, Badge } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, PlayCircleOutlined, HistoryOutlined, DeleteOutlined } from '@ant-design/icons';
import { Action, TableCard, AuthButton } from 'components';
import { http, hasPermission, history, t } from 'libs';
import S, { STATUS_COLORS, STATUS_TEXTS } from './store';

function ComTable() {
  useEffect(() => {
    S.fetchRecords()
  }, [])

  function handleDelete(text) {
    Modal.confirm({
      title: t('删除确认'),
      content: t('确定要删除【{}】?', text['name']),
      okType: 'danger',
      onOk: () => {
        return http.delete('/api/pipeline/', {params: {id: text.id}})
          .then(() => {
            message.success(t('删除成功'));
            S.fetchRecords()
          })
      }
    })
  }

  function toDetail(info) {
    history.push(`/pipeline/${info ? info.id : 'new'}`)
  }

  function handleToggle(info, checked) {
    http.post('/api/pipeline/', {...info, is_active: checked})
      .then(() => {
        message.success(checked ? t('已启用') : t('已禁用'));
        S.fetchRecords()
      })
  }

  return (
    <TableCard
      tKey="pipe"
      rowKey="id"
      title={t('流水线列表')}
      loading={S.isFetching}
      dataSource={S.dataSource}
      onReload={S.fetchRecords}
      actions={[
        <Input
          key="search"
          allowClear
          placeholder={t('搜索流程名称')}
          prefix={<SearchOutlined/>}
          style={{width: 200}}
          onChange={e => S.f_name = e.target.value}/>,
        <AuthButton
          key="add"
          auth="pipeline.pipeline.add"
          type="primary"
          icon={<PlusOutlined/>}
          onClick={() => toDetail()}>{t('新建')}</AuthButton>
      ]}
      pagination={{
        showSizeChanger: true,
        showLessItems: true,
        showTotal: total => t('共 {} 条', total),
        pageSizeOptions: ['10', '20', '50', '100']
      }}>
      <Table.Column
        title={t('流水线名称')}
        width={220}
        render={info => (
          <Space>
            <Badge status={info.is_active ? 'processing' : 'default'}/>
            <span style={{fontWeight: 500, color: info.is_active ? 'inherit' : '#bbb'}}>
              {info.name}
            </span>
          </Space>
        )}/>
      <Table.Column
        ellipsis
        title={t('描述')}
        dataIndex="desc"
        width={220}
        render={text => text ? <span style={{color: '#888'}}>{text}</span> : <span style={{color: '#ccc'}}>-</span>}/>
      <Table.Column
        width={90}
        align="center"
        title={t('节点数')}
        render={info => <Tag style={{margin: 0}}>{(info.nodes?.length || 0)} {t('个')}</Tag>}/>
      <Table.Column
        width={170}
        title={t('最近执行')}
        render={info => info.latest_at ? (
          <div style={{lineHeight: 1.6}}>
            <Tag
              color={STATUS_COLORS[info.latest_status]}
              style={{margin: 0, marginRight: 4}}>
              {STATUS_TEXTS[info.latest_status] || '-'}
            </Tag>
            <span style={{color: '#999', fontSize: 12}}>{info.latest_at}</span>
          </div>
        ) : <span style={{color: '#ccc'}}>{t('未执行')}</span>}/>
      <Table.Column
        width={120}
        title={t('创建人')}
        dataIndex="created_by_user"
        hide
        render={text => text ? <span style={{color: '#666'}}>{text}</span> : '-'}/>
      <Table.Column
        width={160}
        title={t('创建时间')}
        dataIndex="created_at"
        hide
        render={text => <Tooltip title={text}><span style={{color: '#999', fontSize: 12}}>{text}</span></Tooltip>}/>
      <Table.Column
        width={100}
        align="center"
        title={t('启用')}
        render={info => (
          <Switch
            size="small"
            checked={info.is_active}
            disabled={!hasPermission('pipeline.pipeline.edit')}
            onChange={checked => handleToggle(info, checked)}/>
        )}/>
      <Table.Column
        width={240}
        title={t('操作')}
        render={info => (
          <Action>
            <Action.Button auth="pipeline.pipeline.edit" onClick={() => toDetail(info)}>
              <Tooltip title={t('编辑')}><EditOutlined/></Tooltip>
            </Action.Button>
            {hasPermission('pipeline.pipeline.do') && (
              <Popconfirm title={t('确定要执行吗？')} onConfirm={() => S.showConsole(info)}>
                <Action.Button>
                  <Tooltip title={t('执行')}><PlayCircleOutlined/></Tooltip>
                </Action.Button>
              </Popconfirm>
            )}
            <Action.Button onClick={() => S.showHistories(info)}>
              <Tooltip title={t('执行记录')}><HistoryOutlined/></Tooltip>
            </Action.Button>
            <Action.Button danger auth="pipeline.pipeline.del" onClick={() => handleDelete(info)}>
              <Tooltip title={t('删除')}><DeleteOutlined/></Tooltip>
            </Action.Button>
          </Action>
        )}/>
    </TableCard>
  )
}

export default observer(ComTable)
