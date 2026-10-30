import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { PlusOutlined, ThunderboltOutlined, BulbOutlined, QuestionCircleOutlined, DesktopOutlined } from '@ant-design/icons';
import { Form, Button, Radio, Tooltip, Flex, Typography, Tag, Card, Empty, Drawer, Pagination } from 'antd';
import { ACEditor, AuthDiv, Breadcrumb } from 'components';
import HostSelector from 'pages/host/Selector';
import TemplateSelector from './TemplateSelector';
import Parameter from './Parameter';
import Output from './Output';
import { http, cleanCommand } from 'libs';
import moment from 'moment';
import store from './store';
import gStore from 'gStore';
import style from './index.module.less';

const { Text } = Typography;

function TaskIndex() {
  const [loading, setLoading] = useState(false)
  const [interpreter, setInterpreter] = useState('sh')
  const [command, setCommand] = useState('')
  const [template_id, setTemplateId] = useState()
  const [histories, setHistories] = useState([])
  const [parameters, setParameters] = useState([])
  const [visible, setVisible] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const pagedHistories = histories.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    if (!loading) {
      http.get('/api/exec/do/')
        .then(res => setHistories(res))
    }
  }, [loading])

  useEffect(() => {
    if (!command) {
      setParameters([])
    }
  }, [command])

  useEffect(() => {
    gStore.fetchUserSettings()
    return () => {
      store.host_ids = []
      if (store.showConsole) {
        store.switchConsole()
      }
    }
  }, [])

  function handleSubmit(params) {
    if (!params && parameters.length > 0) {
      return setVisible(true)
    }
    setLoading(true)
    const formData = {interpreter, template_id, params, host_ids: store.host_ids, command: cleanCommand(command)}
    http.post('/api/exec/do/', formData)
      .then(store.switchConsole)
      .finally(() => setLoading(false))
  }

  function handleTemplate(tpl) {
    if (tpl.host_ids.length > 0) store.host_ids = tpl.host_ids
    setTemplateId(tpl.id)
    setInterpreter(tpl.interpreter)
    setCommand(tpl.body)
    setParameters(tpl.parameters)
  }

  function handleClick(item) {
    setTemplateId(item.template_id)
    setInterpreter(item.interpreter)
    setCommand(item.command)
    setParameters(item.parameters || [])
    store.host_ids = item.host_ids
  }

  return (
    <AuthDiv auth="exec.task.do">
      <Breadcrumb items={['首页', '批量执行', '执行任务']} />
      <div className={style.index}>
        <div className={style.left}>
          <Form layout="vertical" className={style.form}>
            <div className={style.section}>
              <Flex align="center" justify="space-between" className={style.sectionLabel}>
                <Flex align="center" gap={8}>
                  <DesktopOutlined className={style.sectionIcon} />
                  <Text strong>目标主机</Text>
                </Flex>
                <Tag color={store.host_ids.length > 0 ? 'processing' : 'default'} bordered={false}
                     className={style.hostCount}>
                  {store.host_ids.length > 0 ? `${store.host_ids.length} 台已选` : '未选择'}
                </Tag>
              </Flex>
              <Form.Item required className={style.hostItem}>
                <HostSelector type="button" value={store.host_ids} onChange={ids => store.host_ids = ids}/>
              </Form.Item>
            </div>

            <div className={style.section}>
              <Flex align="center" justify="space-between" className={style.sectionLabel}>
                <Text strong>执行命令</Text>
                <Flex gap={8} align="center">
                  <Tooltip title="使用全局变量？">
                    <a href="https://ops.spug.cc/docs/batch-exec" target="_blank" rel="noopener noreferrer"
                       className={style.varLink}>
                      <BulbOutlined /> 变量
                    </a>
                  </Tooltip>
                  <Button size="small" icon={<PlusOutlined />} onClick={store.switchTemplate}>从模版选择</Button>
                </Flex>
              </Flex>
              <Radio.Group
                buttonStyle="solid"
                value={interpreter}
                onChange={e => setInterpreter(e.target.value)}
                className={style.interpreter}
              >
                <Radio.Button value="sh">Shell</Radio.Button>
                <Radio.Button value="python">Python</Radio.Button>
              </Radio.Group>
              <ACEditor className={style.editor} mode={interpreter} value={command} width="100%" onChange={setCommand}/>
            </div>
          </Form>
          <div className={style.actionBar}>
            <Button loading={loading} icon={<ThunderboltOutlined />} type="primary" block size="large"
                    className={style.runBtn}
                    onClick={() => handleSubmit()}>开始执行</Button>
          </div>
        </div>

        <div className={style.right}>
          <Flex align="center" justify="space-between" className={style.rightHeader}>
            <Flex align="center" gap={8}>
              <Text strong>执行记录</Text>
              <Tooltip title="多次相同的执行记录将会合并展示，每天自动清理，保留最近30条记录。">
                <QuestionCircleOutlined style={{ color: 'var(--color-text-tertiary)' }} />
              </Tooltip>
            </Flex>
            <Tag color="blue">{histories.length} 条</Tag>
          </Flex>
          <div className={style.inner}>
            {histories.length === 0 ? (
              <Empty description="暂无执行记录" image={Empty.PRESENTED_IMAGE_SIMPLE} className={style.empty} />
            ) : (
              pagedHistories.map((item, index) => (
                <Card
                  key={index}
                  size="small"
                  hoverable
                  className={style.recordCard}
                  onClick={() => handleClick(item)}
                >
                  <Flex align="center" gap={8}>
                    <Tag color={item.interpreter === 'sh' ? 'blue' : 'gold'} style={{ margin: 0 }}>
                      {item.interpreter === 'sh' ? 'Sh' : 'Py'}
                    </Tag>
                    <Tag style={{ margin: 0 }}>{item.host_ids.length} 台</Tag>
                    <Text ellipsis style={{ flex: 1, fontSize: 12 }}>
                      {item.template_name || item.command}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      {moment(item.updated_at).format('MM.DD HH:mm')}
                    </Text>
                  </Flex>
                </Card>
              ))
            )}
          </div>
          {histories.length > 0 && (
            <Pagination
              className={style.pagination}
              size="small"
              current={page}
              pageSize={pageSize}
              total={histories.length}
              showSizeChanger
              pageSizeOptions={[10, 20, 50]}
              onChange={(p, ps) => { setPage(p); setPageSize(ps) }}
            />
          )}
        </div>
      </div>
      <Drawer
        title="执行详情"
        placement="right"
        width="75%"
        open={store.showConsole}
        onClose={store.switchConsole}
        styles={{ body: { padding: 0, height: 'calc(100vh - 55px)', overflow: 'hidden' } }}
        destroyOnClose
      >
        {store.showConsole && <Output />}
      </Drawer>
      {store.showTemplate && <TemplateSelector onCancel={store.switchTemplate} onOk={handleTemplate}/>}
      {visible && <Parameter parameters={parameters} onCancel={() => setVisible(false)} onOk={v => handleSubmit(v)}/>}
    </AuthDiv>
  )
}

export default observer(TaskIndex)
