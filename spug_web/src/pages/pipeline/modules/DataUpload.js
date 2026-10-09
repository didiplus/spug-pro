import React, { useEffect } from 'react';
import { Form, Input, Radio, InputNumber, message } from 'antd';
import { t } from 'libs';
import HostSelector from 'pages/host/Selector';

function DataUpload(props) {
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
    if (!data.source_path) return message.error(t('请输入源文件路径'))
    if (!data.targets || data.targets.length === 0) return message.error(t('请选择上传目标主机'))
    if (!data.path) return message.error(t('请输入上传路径'))
    return data
  }

  return (
    <Form layout="vertical" form={form} initialValues={props.node} requiredMark="optional">
      <Form.Item required name="name" label={t('节点名称')}>
        <Input placeholder={t('请输入节点名称')}/>
      </Form.Item>
      <Form.Item required name="condition" label={t('执行条件')} tooltip={t('当该节点为流程的起始节点时（无上游节点），该条件将会被忽略。')}>
        <Radio.Group buttonStyle="solid">
          <Radio.Button value="success">{t('成功时')}</Radio.Button>
          <Radio.Button value="error">{t('失败时')}</Radio.Button>
          <Radio.Button value="always">{t('总是')}</Radio.Button>
        </Radio.Group>
      </Form.Item>
      <Form.Item required name="source_path" label={t('源文件路径')} tooltip={t('Spug 服务器上的本地文件路径，支持变量替换如 ${_SPUG_name}')}>
        <Input placeholder={t('请输入源文件路径，如 /tmp/artifacts/app.tar.gz')}/>
      </Form.Item>
      <Form.Item required name="targets" label={t('选择上传目标主机')} tooltip={t('文件将会上传到选择的主机上')}>
        <HostSelector type="button"/>
      </Form.Item>
      <Form.Item required name="path" label={t('上传路径')} tooltip={t('文件将会上传到所选择主机的该路径，同名文件将会被覆盖')}>
        <Input placeholder={t('请输入上传路径，如 /data/app/app.tar.gz')}/>
      </Form.Item>
      <Form.Item name="accept" label={t('文件类型限制')} tooltip={t('限制上传的文件类型')}>
        <Input placeholder={t('请输入接受上传的文件类型')}/>
      </Form.Item>
      <Form.Item name="size" label={t('文件大小限制')} tooltip={t('限制上传的文件大小，单位为MB')}>
        <InputNumber addonAfter="MB" placeholder={t('请输入文件大小限制')}/>
      </Form.Item>
    </Form>
  )
}

export default DataUpload
