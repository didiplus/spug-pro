import React, { useEffect } from 'react';
import { Form, Input, Radio, message, Card } from 'antd';
import { ACEditor } from 'components';
import { t } from 'libs';
import HostSelector from 'pages/host/Selector';

function Build(props) {
  const [form] = Form.useForm()

  useEffect(() => {
    props.setHandler(() => handleSave)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    form.resetFields()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.node])

  function handleSave() {
    const data = form.getFieldsValue()
    if (!data.name) return message.error(t('请输入节点名称'))
    if (!data.condition) return message.error(t('请选择节点的执行条件'))
    if (!data.target) return message.error(t('请选择构建主机'))
    if (!data.workspace) return message.error(t('请输入工作目录'))
    if (!data.command) return message.error(t('请输入构建命令'))
    return data
  }

  return (
    <Form layout="vertical" form={form} initialValues={props.node} requiredMark="optional">
      <Form.Item required name="name" label={t('节点名称')}>
        <Input placeholder={t('请输入节点名称')}/>
      </Form.Item>
      <Form.Item required name="condition" label={t('执行条件')}
                 tooltip={t('当该节点为流程的起始节点时（无上游节点），该条件将会被忽略。')}>
        <Radio.Group buttonStyle="solid">
          <Radio.Button value="success">{t('成功时')}</Radio.Button>
          <Radio.Button value="error">{t('失败时')}</Radio.Button>
          <Radio.Button value="always">{t('总是')}</Radio.Button>
        </Radio.Group>
      </Form.Item>
      <Card type="inner" title={t('Git 配置')} size="small" style={{marginBottom: 16}}>
        <Form.Item required name="git_url" label={t('仓库地址')}>
          <Input placeholder={t('请输入Git仓库地址')}/>
        </Form.Item>
        <Form.Item name="git_branch" label={t('构建分支')}>
          <Input placeholder={t('请输入构建分支，如 main/master')}/>
        </Form.Item>
      </Card>
      <Form.Item required name="target" label={t('构建主机')}>
        <HostSelector onlyOne type="button"/>
      </Form.Item>
      <Form.Item required name="workspace" label={t('工作目录')}>
        <Input placeholder={t('请输入工作目录路径')}/>
      </Form.Item>
      <Form.Item required name="command" label={t('构建命令')}>
        <ACEditor mode="sh" width="100%" height="200px"/>
      </Form.Item>
    </Form>
  )
}

export default Build
