import React, { useEffect, useState } from 'react';
import { Form, Input, Radio, message, Card, Upload, Button, Space, Typography } from 'antd';
import { UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { t, http } from 'libs';
import HostSelector from 'pages/host/Selector';

const { Text } = Typography;

function DataTransfer(props) {
  const [form] = Form.useForm()
  const [uploading, setUploading] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)

  useEffect(() => {
    props.setHandler(() => handleSave)
    const initPath = props.node?.source?.path
    if (initPath) {
      setUploadedFile({name: initPath.split('/').pop(), path: initPath})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSave() {
    const data = form.getFieldsValue()
    if (!data.name) return message.error(t('请输入节点名称'))
    if (!data.condition) return message.error(t('请选择节点的执行条件'))
    if (!data.source?.path) return message.error(t('请上传文件或输入源文件路径'))
    if (!data.destination?.path) return message.error(t('请输入传输目标路径'))
    if (!data.destination?.targets) return message.error(t('请选择传输目标主机'))
    return data
  }

  function handleUpload(file) {
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    http.post('/api/pipeline/upload/', formData, {timeout: 300000})
      .then(res => {
        form.setFieldValue(['source', 'path'], res.path)
        setUploadedFile({name: res.name, path: res.path, size: res.size})
        message.success(t('上传成功'))
      })
      .finally(() => setUploading(false))
    return false
  }

  function handleRemove() {
    if (uploadedFile?.path) {
      http.delete('/api/pipeline/upload/', {params: {path: uploadedFile.path}})
    }
    form.setFieldValue(['source', 'path'], undefined)
    setUploadedFile(null)
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
      <Card type="inner" title={t('数据源')} size="small" style={{marginBottom: 16}}>
        <Form.Item label={t('上传文件到 Spug 服务器')}>
          <Space direction="vertical" style={{width: '100%'}}>
            <Upload beforeUpload={handleUpload} fileList={[]} maxCount={1}>
              <Button icon={<UploadOutlined/>} loading={uploading}>
                {t('点击选择文件上传')}
              </Button>
            </Upload>
            {uploadedFile && (
              <Space>
                <Text type="success">{uploadedFile.name}</Text>
                {uploadedFile.size != null && (
                  <Text type="secondary">({Math.round(uploadedFile.size / 1024)} KB)</Text>
                )}
                <Button type="link" danger size="small" icon={<DeleteOutlined/>} onClick={handleRemove}>
                  {t('移除')}
                </Button>
              </Space>
            )}
          </Space>
        </Form.Item>
        <Form.Item name={['source', 'path']} label={t('源文件路径')}
                   tooltip={t('上传文件后自动填充，也可手动输入 Spug 服务器上的路径，支持变量替换如 ${_SPUG_name}')/* eslint-disable-line no-template-curly-in-string */}>
          <Input placeholder={t('上传文件后自动填充，或手动输入源文件路径')}/>
        </Form.Item>
      </Card>
      <Card type="inner" title={t('传输目标')} size="small" style={{marginBottom: 16}}>
        <Form.Item required name={['destination', 'path']} label={t('路径')}
                   tooltip={t('以 / 结尾则同步文件至该目录下并保留原文件名，否则该路径即为同步后的文件路径')}>
          <Input placeholder={t('请输入目标路径')}/>
        </Form.Item>
        <Form.Item required name={['destination', 'targets']} label={t('主机')}>
          <HostSelector type="button"/>
        </Form.Item>
      </Card>
    </Form>
  )
}

export default DataTransfer
