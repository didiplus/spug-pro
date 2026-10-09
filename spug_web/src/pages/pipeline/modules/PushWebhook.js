import React, { useEffect, useMemo } from 'react';
import { Form, Input, Radio, Switch, Alert, message } from 'antd';
import { t } from 'libs';

const MODULES = {
  push_dd: {
    label: () => t('钉钉'),
    placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=xxx',
    secret: true,
    secretTip: () => t('钉钉机器人安全设置选择「加签」时填写，未开启加签可留空。'),
    atTip: () => t('开启后会 @所有人'),
  },
  push_fs: {
    label: () => t('飞书'),
    placeholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx',
    secret: true,
    secretTip: () => t('飞书机器人安全设置选择「签名校验」时填写，未开启可留空。'),
    atTip: () => t('开启后会在卡片内容中 @所有人。'),
  },
  push_wx: {
    label: () => t('企业微信'),
    placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx',
    secret: false,
    atTip: () => t('企业微信的 markdown 消息不支持 @'),
  },
};

function defaultBody() {
  return [
    t('**流水线：** $SPUG_PIPE_NAME'),
    t('**状态：** $SPUG_STATE_TEXT'),
    t('**时间：** $SPUG_DATETIME'),
  ].join('\n')
}

function PushWebhook(props) {
  const [form] = Form.useForm()
  const conf = MODULES[props.node.module] || MODULES.push_dd

  const initialValues = useMemo(() => ({
    condition: 'always',
    title: t('流水线执行通知'),
    body: defaultBody(),
    ...props.node,
  }), [props.node])

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
    if (!data.url) return message.error(t('请输入Webhook地址'))
    if (!data.title) return message.error(t('请输入推送标题'))
    if (!data.body) return message.error(t('请输入推送内容'))
    return data
  }

  return (
    <Form layout="vertical" form={form} initialValues={initialValues} requiredMark="optional">
      <Form.Item required name="name" label={t('节点名称')}>
        <Input placeholder={t('请输入节点名称')}/>
      </Form.Item>
      <Form.Item
        required
        name="condition"
        label={t('执行条件')}
        tooltip={t('当该节点为流程的起始节点时（无上游节点），该条件将会被忽略。')}>
        <Radio.Group buttonStyle="solid">
          <Radio.Button value="success">{t('成功时')}</Radio.Button>
          <Radio.Button value="error">{t('失败时')}</Radio.Button>
          <Radio.Button value="always">{t('总是')}</Radio.Button>
        </Radio.Group>
      </Form.Item>
      <Form.Item required name="condition" label={t('执行条件')}
                 tooltip={t('当该节点为流程的起始节点时（无上游节点），该条件将会被忽略。')}>
        <Radio.Group>
          <Radio.Button value="success">{t('上游执行成功时')}</Radio.Button>
          <Radio.Button value="error">{t('上游执行失败时')}</Radio.Button>
          <Radio.Button value="always">{t('总是执行')}</Radio.Button>
        </Radio.Group>
      </Form.Item>
      <Form.Item required name="url" label={t('{} 机器人 Webhook 地址', conf.label())}>
        <Input placeholder={conf.placeholder}/>
      </Form.Item>
      {conf.secret ? (
        <Form.Item name="secret" label={t('加签密钥')} tooltip={conf.secretTip()}>
          <Input.Password placeholder={t('未开启加签可留空')}/>
        </Form.Item>
      ) : null}
      <Form.Item required name="title" label={t('推送标题')}>
        <Input placeholder={t('请输入推送标题')}/>
      </Form.Item>
      <Form.Item required name="body" label={t('推送内容')}
                 extra={t('支持 markdown 语法，可使用 $SPUG_PIPE_NAME、$SPUG_NODE_NAME、$SPUG_STATE_TEXT、$SPUG_DATETIME 等变量。')}>
        <Input.TextArea autoSize={{minRows: 5, maxRows: 12}} placeholder={t('请输入推送内容')}/>
      </Form.Item>
      <Form.Item name="at_all" valuePropName="checked" label={t('@所有人')} tooltip={conf.atTip()}>
        <Switch checkedChildren={t('是')} unCheckedChildren={t('否')}/>
      </Form.Item>
      <Alert showIcon type="info"
        message={t('推送节点通常建议将执行条件设置为「总是执行」或「上游执行失败时」，以便在流程失败时也能收到通知。')}/>
    </Form>
  )
}

export default PushWebhook