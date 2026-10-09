import React from 'react';
import { observer } from 'mobx-react';
import { Modal, Table, Tag, Button } from 'antd';
import { t } from 'libs';
import S, { STATUS_COLORS, STATUS_TEXTS } from './store';

function Record() {
  function handleShow(info) {
    S.showHistoryConsole(info)
  }

  return (
    <Modal
      open={S.historyVisible}
      width={800}
      title={t('执行记录')}
      onCancel={() => S.historyVisible = false}
      footer={null}>
      <Table
        rowKey="id"
        size="small"
        loading={S.historyFetching}
        dataSource={S.histories}
        pagination={{ pageSize: 10 }}>
        <Table.Column title={t('状态')} width={100} render={info => (
          <Tag color={STATUS_COLORS[info.status]}>{info.status_alias || STATUS_TEXTS[info.status]}</Tag>
        )}/>
        <Table.Column title={t('触发用户')} dataIndex="created_by_name" width={120}/>
        <Table.Column title={t('开始时间')} dataIndex="started_at" width={180}/>
        <Table.Column title={t('完成时间')} dataIndex="finished_at" width={180}/>
        <Table.Column title={t('操作')} width={80} render={info => (
          <Button type="link" onClick={() => handleShow(info)}>{t('查看')}</Button>
        )}/>
      </Table>
    </Modal>
  )
}

export default observer(Record)