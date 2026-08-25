import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, InputNumber } from 'antd';
import { message } from 'libs/message';
import { http } from 'libs';
import { IconSelect } from 'components';
import { clearCodesCache } from '../role/menuCodes';

export default function MenuForm({ visible, editRecord, parentId, parentOptions, onCancel, onSuccess }) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      if (editRecord) {
        form.setFieldsValue(editRecord);
      } else {
        form.resetFields();
        form.setFieldsValue({
          parent_id: parentId || 0,
          order_num: 0,
          menu_type: 'C',
          visible: '0',
          status: '0',
          is_frame: 1,
          is_cache: 0,
        });
      }
    }
  }, [visible, editRecord, parentId]);

  function handleSubmit() {
    form.validateFields().then(values => {
      setSubmitting(true);
      const req = editRecord
        ? http.patch('/api/setting/menus/manage/', { ...values, id: editRecord.id })
        : http.post('/api/setting/menus/manage/', values);
      req.then(() => {
        message.success('操作成功');
        clearCodesCache();
        onSuccess();
      }).finally(() => setSubmitting(false));
    });
  }

  return (
    <Modal
      open={visible}
      width={640}
      maskClosable={false}
      title={editRecord ? '编辑菜单' : '新建菜单'}
      onCancel={onCancel}
      confirmLoading={submitting}
      onOk={handleSubmit}
    >
      <Form form={form} labelCol={{ span: 6 }} wrapperCol={{ span: 16 }} layout="horizontal">
        <Form.Item name="parent_id" label="父菜单">
          <Select options={[{value: 0, label: '顶级菜单'}, ...parentOptions]} placeholder="选择父菜单"/>
        </Form.Item>
        <Form.Item name="menu_type" label="菜单类型">
          <Select
            options={[
              {value: 'M', label: '目录（M）'},
              {value: 'C', label: '菜单（C）'},
              {value: 'F', label: '按钮（F）'},
            ]}
          />
        </Form.Item>
        <Form.Item name="menu_name" label="菜单名称" rules={[{ required: true, message: '请输入菜单名称' }]}>
          <Input placeholder="如：主机管理"/>
        </Form.Item>
        <Form.Item name="icon" label="菜单图标">
          <IconSelect placeholder="选择图标"/>
        </Form.Item>
        <Form.Item name="order_num" label="显示排序">
          <InputNumber min={0} style={{ width: '100%' }}/>
        </Form.Item>
        <Form.Item name="path" label="路由路径">
          <Input placeholder="如 /host，目录类型可不填"/>
        </Form.Item>
        <Form.Item name="component" label="组件路径">
          <Input placeholder="如 pages/host"/>
        </Form.Item>
        <Form.Item name="perms" label="权限标识">
          <Input placeholder="如 host.host.view，支持 | 表示或关系"/>
        </Form.Item>
        <Form.Item name="visible" label="显示状态">
          <Select options={[{value: '0', label: '显示'}, {value: '1', label: '隐藏'}]}/>
        </Form.Item>
        {editRecord && (
          <Form.Item name="status" label="菜单状态">
            <Select options={[{value: '0', label: '正常'}, {value: '1', label: '停用'}]}/>
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}