import React, { useState } from 'react';
import { observer } from 'mobx-react';
import { Modal, Form, Input, Select, Switch, Divider, Typography } from 'antd';
import { GithubOutlined, FolderOutlined, AppstoreOutlined } from '@ant-design/icons';
import { message } from 'libs/message';
import { http } from 'libs';
import store from './store';
import styles from './role-market.module.css';

const { Text } = Typography;

export default observer(function () {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const sourceType = Form.useWatch('source_type', form);
  const isLocal = sourceType === 'local';
  const isGit = sourceType === 'github';
  const isGalaxy = sourceType === 'galaxy';

  function handleSubmit() {
    form.validateFields().then(values => {
      if (isLocal && !values.name) {
        message.error('本地类型必须填写 Role 名称（对应 storage/roles/<名称> 目录）');
        return;
      }
      if (isGalaxy && !values.name) {
        message.error('Galaxy 类型必须填写 Role 名称');
        return;
      }
      setLoading(true);
      http.post('/api/ansible/roles/market/', values)
        .then(() => {
          message.success('添加成功，安装进行中');
          store.addVisible = false;
          store.fetchRecords();
        })
        .catch(() => { store.fetchRecords(); })
        .finally(() => setLoading(false))
    })
  }

  return (
    <Modal
      visible
      width={560}
      maskClosable={false}
      title="添加 Role 源"
      onCancel={() => store.addVisible = false}
      confirmLoading={loading}
      okText="添加并安装"
      onOk={handleSubmit}>
      <Form form={form} labelCol={{span: 5}} wrapperCol={{span: 17}} initialValues={{source_type: 'github', branch: 'main', auto_install: true}}>
        <Form.Item name="source_type" label="源类型">
          <Select options={[
            {value: 'github', label: 'GitHub / Git 仓库'},
            {value: 'galaxy', label: 'Ansible Galaxy'},
            {value: 'local', label: '本地目录'},
          ]}/>
        </Form.Item>
        {isGit && (
          <Form.Item
            name="source_url"
            label="源地址"
            rules={[{required: true, message: '请输入源地址'}]}
            extra="支持 GitHub/GitLab 等标准 git URL">
            <Input prefix={<GithubOutlined/>} placeholder="https://github.com/geerlingguy/role_nginx"/>
          </Form.Item>
        )}
        {isGit && (
          <Form.Item name="branch" label="分支/Tag" rules={[{required: true, message: '请输入分支或 Tag'}]}>
            <Input placeholder="main"/>
          </Form.Item>
        )}
        <Form.Item
          name="name"
          label="Role 名称"
          rules={(isLocal || isGalaxy) ? [{required: true, message: '请输入 Role 名称'}] : []}
          extra={isLocal ? '对应 storage/roles/<名称> 目录，如 redis' : isGalaxy ? 'Galaxy Role 名称，如 nginx' : '留空则自动从 URL 解析'}>
          <Input
            prefix={isLocal ? <FolderOutlined/> : isGalaxy ? <AppstoreOutlined/> : undefined}
            placeholder={isLocal ? 'redis' : isGalaxy ? 'nginx' : '可选，如 nginx'}/>
        </Form.Item>
        {(isGit || isGalaxy) && (
          <Form.Item name="namespace" label="命名空间" extra={isGalaxy ? 'Galaxy 命名空间，如 geerlingguy' : '留空则自动从 URL 解析'}>
            <Input placeholder={isGalaxy ? 'geerlingguy' : '可选，如 geerlingguy'}/>
          </Form.Item>
        )}
        <Form.Item name="categories" label="分类标签" extra="逗号分隔">
          <Input placeholder="web,nginx,proxy"/>
        </Form.Item>
        <Divider style={{margin: '8px 0'}}/>
        <Form.Item name="auto_install" label="自动安装" valuePropName="checked" extra={isLocal ? '直接解析本地目录元数据' : isGalaxy ? '通过 ansible-galaxy install 安装' : '添加后立即 git clone 并解析元数据'}>
          <Switch/>
        </Form.Item>
      </Form>
      <div className={styles.hint}>
        <Text type="secondary" style={{fontSize: 12}}>
          {isLocal
            ? '本地类型：直接从 storage/roles/<名称> 目录解析，无需 git clone。请确保目录含 tasks/main.yml（必需）和 meta/main.yml（推荐）。'
            : isGalaxy
              ? 'Galaxy 类型：通过 ansible-galaxy install <namespace>.<name> 安装。请确保部署机已安装 ansible-galaxy 命令。'
              : '规范要求：Role 仓库需包含 meta/main.yml（Galaxy 标准）和 defaults/main.yml（变量定义），tasks/main.yml 为入口。'}
        </Text>
      </div>
    </Modal>
  )
})
