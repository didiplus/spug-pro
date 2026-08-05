/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { ExclamationCircleOutlined, UploadOutlined } from '@ant-design/icons';
import { message } from 'libs/message';
import { Modal, Form, Input, Space, TreeSelect, Button, Upload, Alert } from 'antd';
import { http, X_TOKEN } from 'libs';
import store from './store';

export default observer(function () {
  const [modal, contextHolder] = Modal.useModal();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState([]);

  // 标记组件是否已挂载，用于防止卸载后的状态更新
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (store.record.pkey) {
      setFileList([{ uid: '0', name: '独立密钥', data: store.record.pkey }]);
    }
    // 清理时标记为已卸载
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 二次确认密码表单
  const ConfirmForm = (props) => (
    <Form layout="horizontal" style={{ marginTop: 24 }}>
      <Form.Item
        required
        label="授权密码"
        extra={`用户 ${props.username} 的密码，该密码仅做首次验证使用，不会存储该密码。`}
      >
        <Input.Password onChange={(e) => props.onChange(e.target.value)} />
      </Form.Item>
    </Form>
  );

  // 提交验证
  async function handleSubmit() {
    try {
      await form.validateFields();
    } catch (error) {
      return;
    }

    setLoading(true);
    const formData = form.getFieldsValue();
    formData['id'] = store.record.id;
    const file = fileList[0];
    if (file && file.data) formData['pkey'] = file.data;

    http
      .post('/api/host/', formData)
      .then((res) => {
        // 组件已卸载则不再处理
        if (!isMountedRef.current) return;

        if (res === 'auth fail') {
          setLoading(false);
          if (formData.pkey) {
            message.error('独立密钥认证失败');
          } else {
            const onChange = (v) => (formData.password = v);
            modal.confirm({
              icon: <ExclamationCircleOutlined />,
              title: '首次验证请输入密码',
              content: <ConfirmForm username={formData.username} onChange={onChange} />,
              onOk: () => {
                // 二次确认时可能组件已卸载，再检查一次
                if (isMountedRef.current) {
                  handleConfirm(formData);
                }
              },
            });
          }
        } else {
          message.success('验证成功');
          store.formVisible = false;
          store.fetchRecords();
          store.fetchExtend(res.id);
        }
      })
      .catch(() => {
        if (isMountedRef.current) {
          setLoading(false);
        }
      });
  }

  // 二次确认后的提交
  function handleConfirm(formData) {
    if (!isMountedRef.current) return Promise.reject(); // 已卸载则直接拒绝

    if (formData.password) {
      return http
        .post('/api/host/', formData)
        .then((res) => {
          if (!isMountedRef.current) return;
          message.success('验证成功');
          store.formVisible = false;
          store.fetchRecords();
          store.fetchExtend(res.id);
        })
        .catch(() => {});
    }
    message.error('请输入授权密码');
    return Promise.reject();
  }

  // 上传文件回调
  function handleUploadChange(v) {
    if (!isMountedRef.current) return;
    if (v.fileList.length === 0) {
      setFileList([]);
    }
  }

  function handleUpload(file) {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    http
      .post('/api/host/parse/', formData)
      .then((res) => {
        if (!isMountedRef.current) return;
        file.data = res;
        setFileList([file]);
      })
      .finally(() => {
        if (isMountedRef.current) {
          setUploading(false);
        }
      });
    return false;
  }

  const info = store.record;

  return (
    <>
      {contextHolder}
      <Modal
        open
        width={700}
        maskClosable={false}
        title={store.record.id ? '编辑主机' : '新建主机'}
        okText="验证"
        onCancel={() => (store.formVisible = false)}
        confirmLoading={loading}
        onOk={handleSubmit}
      >
        <Form form={form} labelCol={{ span: 5 }} wrapperCol={{ span: 17 }} initialValues={info}>
          <Form.Item
            name="group_ids"
            label="主机分组"
            rules={[{ required: true, message: '请选择分组' }]}
          >
            <TreeSelect
              multiple
              treeNodeLabelProp="name"
              treeData={store.treeData}
              showCheckedStrategy={TreeSelect.SHOW_CHILD}
              placeholder="请选择分组"
            />
          </Form.Item>

          <Form.Item
            name="name"
            label="主机名称"
            rules={[{ required: true, message: '请输入主机名称' }]}
          >
            <Input placeholder="请输入主机名称" />
          </Form.Item>

          <Form.Item
            required
            label="连接地址"
            style={{ marginBottom: 20 }}
          >
            <Space.Compact style={{ width: '100%' }}>
              <Input style={{ width: '12%' }} defaultValue="ssh" disabled />
              <Form.Item
                name="username"
                noStyle
                rules={[{ required: true, message: '请输入用户名' }]}
              >
                <Input style={{ width: '23%' }} placeholder="用户名" />
              </Form.Item>
              <Input style={{ width: '10%' }} defaultValue="@" disabled />
              <Form.Item
                name="hostname"
                noStyle
                rules={[{ required: true, message: '请输入主机名/IP' }]}
              >
                <Input style={{ width: '34%' }} placeholder="主机名/IP" />
              </Form.Item>
              <Input style={{ width: '10%' }} defaultValue="-p" disabled />
              <Form.Item
                name="port"
                noStyle
                rules={[{ required: true, message: '请输入端口号' }]}
              >
                <Input style={{ width: '19%' }} placeholder="端口" />
              </Form.Item>
            </Space.Compact>
          </Form.Item>

          <Form.Item
            label="独立密钥"
            extra="默认使用全局密钥，如果上传了独立密钥（私钥）则优先使用该密钥。"
          >
            <Upload
              name="file"
              fileList={fileList}
              headers={{ 'X-Token': X_TOKEN }}
              beforeUpload={handleUpload}
              onChange={handleUploadChange}
            >
              {fileList.length === 0 ? (
                <Button loading={uploading} icon={<UploadOutlined />}>
                  点击上传
                </Button>
              ) : null}
            </Upload>
          </Form.Item>

          <Form.Item name="desc" label="备注信息">
            <Input.TextArea placeholder="请输入主机备注信息" />
          </Form.Item>

          <Form.Item wrapperCol={{ span: 17, offset: 5 }}>
            <Alert
              showIcon
              type="info"
              message="首次验证时需要输入登录用户名对应的密码，该密码会用于配置SSH密钥认证，不会存储该密码。"
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
});