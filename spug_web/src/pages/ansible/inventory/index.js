import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { Modal, Form, Input, InputNumber, Select, Tree, Button, Flex, Typography, Tag, Table, Empty, Spin, Switch } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { message } from 'libs/message';
import { http, hasPermission } from 'libs';
import { AuthDiv, Breadcrumb, AuthButton, ACEditor } from 'components';
import HostSelector from 'pages/host/Selector';
import store from './store';

const { Text } = Typography;

@observer
class InventoryIndex extends React.Component {
  componentDidMount() {
    store.fetchTree();
    store.fetchGroups();
    store.fetchHosts();
  }

  handleDeleteGroup = (id) => {
    Modal.confirm({
      title: '删除确认',
      content: '确定要删除该分组？子组将一并删除。',
      onOk: () => http.delete('/api/ansible/inventory/', {params: {id}})
        .then(() => {
          message.success('删除成功');
          store.fetchTree();
          store.fetchGroups();
        })
    })
  };

  handleSaveVars = (id, vars) => {
    try {
      const parsed = JSON.parse(vars);
      http.patch('/api/ansible/inventory/', {id, variables: parsed})
        .then(() => {
          message.success('保存成功');
          store.fetchGroups();
        })
    } catch {
      message.error('JSON 格式错误');
    }
  };

  renderGroupPanel = () => {
    const group = store.groupDetail;
    if (!group) return <Empty description="请选择分组"/>;
    return <GroupPanel group={group} onSaveVars={this.handleSaveVars} onDelete={this.handleDeleteGroup}/>;
  };

  renderHostPanel = () => {
    if (!store.hostDetail) return <Empty description="请选择主机"/>;
    return <HostPanel hostId={store.selectedKey.replace('host_', '')} host={store.hostDetail} vars={store.hostVars}/>;
  };

  render() {
    return (
      <AuthDiv auth="ansible.inventory.view">
        <Breadcrumb items={['首页', 'Ansible', 'Inventory 管理']}/>
        <Flex gap={16} style={{height: 'calc(100vh - 120px)'}}>
          <div style={{width: 300, background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto'}}>
            <Flex align="center" justify="space-between" style={{marginBottom: 12}}>
              <Text strong>分组列表</Text>
              {hasPermission('ansible.inventory.edit') && (
                <AuthButton auth="ansible.inventory.edit" size="small" type="primary" icon={<PlusOutlined/>} onClick={() => store.showForm()}>新建</AuthButton>
              )}
            </Flex>
            <Spin spinning={store.isFetching}>
              <Tree
                treeData={store.combinedTree}
                onSelect={(keys, info) => {
                  const node = info.node;
                  if (!node) return;
                  if (node.nodeType === 'host') {
                    store.selectHost(node.hostId);
                  } else if (node.nodeType === 'group' || node.host_ids) {
                    store.selectGroup(keys[0]);
                  }
                }}
                titleRender={(node) => (
                  <Flex align="center" justify="space-between">
                    <Text ellipsis style={{flex: 1}}>
                      {node.nodeType === 'host' ? `🖥 ${node.title}` : `📁 ${node.title}`}
                    </Text>
                    {node.nodeType !== 'host' && hasPermission('ansible.inventory.edit') && (
                      <Flex gap={4}>
                        <Button type="text" size="small" icon={<PlusOutlined/>} onClick={(e) => {e.stopPropagation(); store.showForm({parent_id: node.key})}}/>
                        <Button type="text" size="small" icon={<EditOutlined/>} onClick={(e) => {e.stopPropagation(); store.showForm(store.groups.find(g => g.id === node.key))}}/>
                        <Button type="text" size="small" danger icon={<DeleteOutlined/>} onClick={(e) => {e.stopPropagation(); this.handleDeleteGroup(node.key)}}/>
                      </Flex>
                    )}
                  </Flex>
                )}
              />
            </Spin>
          </div>
          <div style={{flex: 1, background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto'}}>
            {store.selectedType === 'host' ? this.renderHostPanel() : this.renderGroupPanel()}
          </div>
        </Flex>
        {store.formVisible && <GroupForm/>}
      </AuthDiv>
    )
  }
}

@observer
class GroupPanel extends React.Component {
  state = {vars: '{}', hostIds: []};

  componentDidMount() {
    this.syncStateFromProps();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.group !== this.props.group) {
      this.syncStateFromProps();
    }
  }

  syncStateFromProps = () => {
    const {group} = this.props;
    this.setState({
      vars: JSON.stringify(group.variables || {}, null, 2),
      hostIds: group.hosts || []
    });
  };

  handleSave = () => {
    const {group, onSaveVars} = this.props;
    onSaveVars(group.id, this.state.vars);
  };

  handleSaveHosts = () => {
    http.patch('/api/ansible/inventory/', {id: this.props.group.id, host_ids: this.state.hostIds})
      .then(() => {
        message.success('保存成功');
        store.fetchGroups();
      })
  };

  render() {
    const {group} = this.props;
    return (
      <div>
        <Flex align="center" justify="space-between" style={{marginBottom: 16}}>
          <Text strong style={{fontSize: 16}}>{group.name}</Text>
          <Tag color="blue">{this.state.hostIds.length} 台主机</Tag>
        </Flex>
        <Form layout="vertical">
          <Form.Item label="分组名称">
            <Input value={group.name} disabled/>
          </Form.Item>
          <Form.Item label="主机列表">
            <Flex gap={8}>
              <HostSelector nullable value={this.state.hostIds} onChange={ids => this.setState({hostIds: ids})}/>
              <Button type="primary" onClick={this.handleSaveHosts}>保存</Button>
            </Flex>
          </Form.Item>
          <Form.Item label="组变量 (JSON)">
            <ACEditor mode="json" value={this.state.vars} onChange={v => this.setState({vars: v})} height="200px" width="100%"/>
          </Form.Item>
          <Button type="primary" onClick={this.handleSave}>保存变量</Button>
        </Form>
      </div>
    )
  }
}

@observer
class HostPanel extends React.Component {
  state = {addVisible: false};

  handleDeleteVar = (id) => {
    http.delete(`/api/ansible/host_vars/${this.props.hostId}/`, {params: {id}})
      .then(() => {
        message.success('删除成功');
        store.selectHost(this.props.hostId);
      })
  };

  render() {
    const {host, vars} = this.props;
    return (
      <div>
        <Flex align="center" justify="space-between" style={{marginBottom: 16}}>
          <Text strong style={{fontSize: 16}}>{host.name} ({host.hostname})</Text>
          <AuthButton auth="ansible.inventory.edit" size="small" type="primary" icon={<PlusOutlined/>} onClick={() => this.setState({addVisible: true})}>添加变量</AuthButton>
        </Flex>
        <Spin spinning={store.hostVarsFetching}>
          <Table
            rowKey="id"
            size="small"
            dataSource={vars}
            pagination={false}>
            <Table.Column title="变量名" dataIndex="key"/>
            <Table.Column title="值" dataIndex="value" ellipsis render={(v, record) => record.is_vault ? '******' : v}/>
            <Table.Column title="类型" dataIndex="value_type" width={80} render={v => <Tag>{v}</Tag>}/>
            <Table.Column title="Vault" dataIndex="is_vault" width={60} render={v => v ? <Tag color="orange">是</Tag> : '-'}/>
            <Table.Column title="操作" width={80} render={info => (
              <Button danger size="small" type="link" icon={<DeleteOutlined/>} onClick={() => this.handleDeleteVar(info.id)}/>
            )}/>
          </Table>
        </Spin>
        {this.state.addVisible && (
          <AddVarModal
            hostId={this.props.hostId}
            onClose={() => this.setState({addVisible: false})}
          />
        )}
      </div>
    )
  }
}

function AddVarModal({hostId, onClose}) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  function handleSubmit() {
    form.validateFields().then(values => {
      setLoading(true);
      http.post(`/api/ansible/host_vars/${hostId}/`, values)
        .then(() => {
          message.success('添加成功');
          onClose();
          store.selectHost(hostId);
        }, () => setLoading(false))
    })
  }

  return (
    <Modal
      visible
      title="添加主机变量"
      onCancel={onClose}
      confirmLoading={loading}
      onOk={handleSubmit}>
      <Form form={form} labelCol={{span: 6}} wrapperCol={{span: 16}}>
        <Form.Item name="key" label="变量名" rules={[{required: true, message: '请输入变量名'}, {pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: '变量名只能包含字母、数字和下划线，且不能以数字开头'}]}>
          <Input placeholder="如 ansible_python_interpreter"/>
        </Form.Item>
        <Form.Item name="value" label="变量值" rules={[{required: true, message: '请输入变量值'}]}>
          <Input placeholder="请输入变量值"/>
        </Form.Item>
        <Form.Item name="value_type" label="变量类型" initialValue="string">
          <Select options={[
            {value: 'string', label: 'String'},
            {value: 'int', label: 'Integer'},
            {value: 'bool', label: 'Boolean'},
            {value: 'json', label: 'JSON'},
          ]}/>
        </Form.Item>
        <Form.Item name="is_vault" label="Vault 加密" valuePropName="checked">
          <Switch/>
        </Form.Item>
      </Form>
    </Modal>
  )
}

function GroupForm() {
  const [form] = Form.useForm();
  const [hostIds, setHostIds] = useState([]);
  const [vars, setVars] = useState('{}');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const info = store.editingGroup || {};
    form.setFieldsValue(info);
    setHostIds(info.hosts || []);
    setVars(JSON.stringify(info.variables || {}, null, 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit() {
    setLoading(true);
    const formData = form.getFieldsValue();
    formData['id'] = store.editingGroup?.id;
    formData['host_ids'] = hostIds;
    try {
      formData['variables'] = JSON.parse(vars);
    } catch {
      message.error('JSON 格式错误');
      setLoading(false);
      return;
    }
    http.post('/api/ansible/inventory/', formData)
      .then(() => {
        message.success('操作成功');
        store.formVisible = false;
        store.fetchTree();
        store.fetchGroups();
      }, () => setLoading(false))
  }

  return (
    <Modal
      visible
      width={600}
      maskClosable={false}
      title={store.editingGroup?.id ? '编辑分组' : '新建分组'}
      onCancel={() => store.formVisible = false}
      confirmLoading={loading}
      onOk={handleSubmit}>
      <Form form={form} labelCol={{span: 5}} wrapperCol={{span: 17}}>
        <Form.Item required name="name" label="分组名称">
          <Input placeholder="请输入分组名称"/>
        </Form.Item>
        <Form.Item name="parent_id" label="父分组">
          <Input placeholder="可选，父分组 ID"/>
        </Form.Item>
        <Form.Item name="sort_id" label="排序">
          <InputNumber/>
        </Form.Item>
        <Form.Item label="主机列表">
          <HostSelector nullable value={hostIds} onChange={setHostIds}/>
        </Form.Item>
        <Form.Item label="组变量">
          <ACEditor mode="json" value={vars} onChange={setVars} height="150px" width="100%"/>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default InventoryIndex;
