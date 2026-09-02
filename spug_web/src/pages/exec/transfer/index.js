/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import {
  ThunderboltOutlined,
  QuestionCircleOutlined,
  UploadOutlined,
  CloudServerOutlined,

} from '@ant-design/icons';
import { message } from 'libs/message';
import {Form, Button, Tooltip, Space, Table, Input, Upload, Drawer, Flex, Typography, Tag, Empty} from 'antd';
import { AuthDiv, Breadcrumb } from 'components';
import HostSelector from 'pages/host/Selector';
import Output from './Output';
import { http, uniqueId } from 'libs';
import moment from 'moment';
import store from './store';
import style from './index.module.less';

const { Text } = Typography;

function TransferIndex() {
  const [loading, setLoading] = useState(false)
  const [files, setFiles] = useState([])
  const [dir, setDir] = useState('')
  const [hosts, setHosts] = useState([])
  const [percent, setPercent] = useState()
  const [token, setToken] = useState()
  const [histories, setHistories] = useState([])

  useEffect(() => {
    if (!loading) {
      http.get('/api/exec/transfer/')
        .then(res => setHistories(res))
    }
  }, [loading])

  function _handleProgress(e) {
    const data = e.loaded / e.total * 100
    if (!percent && data === 100) return
    setPercent(String(data).replace(/(\d+\.\d).*/, '$1'))
  }

  function handleSubmit() {
    const formData = new FormData();
    if (files.length === 0) return message.error('请添加数据源')
    if (!dir) return message.error('请输入目标路径')
    if (hosts.length === 0) return message.error('请选择目标主机')
    const data = {dst_dir: dir, host_ids: hosts.map(x => x.id)}
    for (let index in files) {
      const item = files[index]
      if (item.type === 'host') {
        data.host = JSON.stringify([item.host_id, item.path])
      } else {
        formData.append(`file${index}`, item.path)
      }
    }
    formData.append('data', JSON.stringify(data))
    setLoading(true)
    http.post('/api/exec/transfer/', formData, {timeout: 600000, onUploadProgress: _handleProgress})
      .then(res => {
        const tmp = {}
        for (let host of hosts) {
          tmp[host.id] = {
            title: `${host.name}(${host.hostname}:${host.port})`,
            data: '\x1b[36m### WebSocket connecting ...\x1b[0m',
            status: -2
          }
        }
        store.outputs = tmp
        setToken(res)
      })
      .finally(() => {
        setLoading(false)
        setPercent()
      })
  }

  function makeFile(row) {
    setFiles([{
      id: uniqueId(),
      type: 'host',
      name: row.name,
      path: '',
      host_id: row.id
    }])
  }

  function handleUpload(_, fileList) {
    const tmp = files.length > 0 && files[0].type === 'upload' ? [...files] : []
    for (let file of fileList) {
      tmp.push({id: uniqueId(), type: 'upload', name: '本地上传', path: file})
    }
    setFiles(tmp)
    return Upload.LIST_IGNORE
  }

  function handleRemove(index) {
    files.splice(index, 1)
    setFiles([...files])
  }

  function handleCloseOutput() {
    setToken()
    if (!store.counter['0'] && !store.counter['2']) {
      setFiles([])
    }
  }

  return (<AuthDiv auth="exec.transfer.do">
    <Breadcrumb items={['首页', '批量执行', '文件分发']} />
    <div className={style.index}>
      <Form layout="vertical" className={style.left}>
        <Form.Item label={`数据源${files.length ? `（${files.length}）` : ''}`}>
          <Space className={style.sourceActions}>
            <Upload multiple beforeUpload={handleUpload}>
              <Button icon={<UploadOutlined />}>上传本地文件</Button>
            </Upload>
            <HostSelector onlyOne mode="rows" onChange={row => makeFile(row)}>
              <Button icon={<CloudServerOutlined />}>添加主机文件</Button>
            </HostSelector>
          </Space>
          <div className={style.fileList}>
            {files.length === 0 ? (
              <Empty description="暂无数据源" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Table rowKey="id" showHeader={false} pagination={false} size="small" dataSource={files}>
                <Table.Column title="文件来源" dataIndex="name" width={120} />
                <Table.Column title="文件名称/路径" render={info => info.type === 'upload' ? info.path.name : (
                  <Input onChange={e => info.path = e.target.value} placeholder="请输入要同步的目录路径"/>)}/>
                <Table.Column title="操作" width={72} render={(_, __, index) => (
                  <Button danger type="link" onClick={() => handleRemove(index)}>移除</Button>)}/>
              </Table>
            )}
          </div>
        </Form.Item>

        <Form.Item required label="目标路径"
          tooltip="文件分发功能依赖rsync，大部分linux发行版默认都已安装，如未安装可通过「批量执行/执行任务」进行批量安装。">
          <Input value={dir} onChange={e => setDir(e.target.value)} placeholder="请输入目标路径"/>
        </Form.Item>
        <Form.Item required label="目标主机">
          <HostSelector type="button" mode="rows" value={hosts.map(x => x.id)} onChange={rows => setHosts(rows)}/>
        </Form.Item>
        <Button loading={loading} icon={<ThunderboltOutlined/>} type="primary" block size="large"
                onClick={() => handleSubmit()}>
          {percent ? `上传中 ${percent}%` : '开始执行'}
        </Button>
      </Form>

      <div className={style.right}>
        <Flex align="center" justify="space-between" style={{ marginBottom: 12 }}>
          <Flex align="center" gap={8}>
            <Text strong>分发记录</Text>
            <Tooltip title="每天自动清理，保留最近30条记录。">
              <QuestionCircleOutlined style={{ color: 'var(--color-text-tertiary)' }} />
            </Tooltip>
          </Flex>
          <Tag color="blue">{histories.length} 条</Tag>
        </Flex>
        <div className={style.inner}>
          {histories.length === 0 ? (
            <Empty description="暂无分发记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            histories.map((item, index) => (
              <div key={index} className={style.historyItem}>
                <Flex align="center" gap={8}>
                  <Tag color={item.src_host_id ? 'blue' : 'gold'} style={{ margin: 0 }}>
                    {item.src_host_id ? '主机' : '上传'}
                  </Tag>
                  <Tag style={{ margin: 0 }}>{item.host_ids.length} 台</Tag>
                  <Text ellipsis style={{ flex: 1, fontSize: 12 }}>
                    {item.dst_dir}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                    {moment(item.updated_at).format('MM.DD HH:mm')}
                  </Text>
                </Flex>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
    <Drawer
      title="执行详情"
      placement="right"
      width="75%"
      open={!!token}
      onClose={handleCloseOutput}
      styles={{ body: { padding: 0, height: 'calc(100vh - 55px)', overflow: 'hidden' } }}
      destroyOnClose
    >
      {token ? <Output token={token} onBack={handleCloseOutput}/> : null}
    </Drawer>
  </AuthDiv>)
}

export default observer(TransferIndex)
