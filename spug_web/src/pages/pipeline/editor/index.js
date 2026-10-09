import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import {
  PlusOutlined, MinusCircleOutlined, UpOutlined, DownOutlined,
  SaveOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { Form, Input, Button, Divider, Switch, Select, Space, message, Alert } from 'antd';
import { AuthDiv, Breadcrumb, ACEditor } from 'components';
import HostSelector from 'pages/host/Selector';
import { http, history, cleanCommand, hasPermission } from 'libs';
import style from './index.module.less';

function PipelineEditor(props) {
  const id = props.match.params.id !== '0' ? parseInt(props.match.params.id) : null;
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [hostIds, setHostIds] = useState([]);
  const [serverActions, setServerActions] = useState([]);
  const [hostActions, setHostActions] = useState([]);
  const [variables, setVariables] = useState([]);
  const [rstNotify, setRstNotify] = useState({ mode: '0', value: '' });

  useEffect(() => {
    if (id) {
      http.get(`/api/pipeline/pipelines/${id}/`).then(res => {
        form.setFieldsValue({
          name: res.name,
          desc: res.desc,
          is_parallel: res.is_parallel,
          is_audit: res.is_audit,
          is_active: res.is_active,
        });
        setHostIds(res.host_ids || []);
        setServerActions(res.server_actions || []);
        setHostActions(res.host_actions || []);
        setVariables(res.variables || []);
        setRstNotify(res.rst_notify || { mode: '0', value: '' });
      });
    }
  }, []);

  function handleSave() {
    form.validateFields().then(values => {
      const sActions = serverActions.filter(x => x.title && x.data);
      const hActions = hostActions.filter(x => x.title && x.data);
      if (sActions.length === 0 && hActions.length === 0) {
        message.warning('请至少添加一个执行动作');
        return;
      }
      setLoading(true);
      const data = {
        ...values,
        host_ids: hostIds,
        server_actions: sActions,
        host_actions: hActions,
        variables: variables.filter(x => x.name),
        rst_notify: rstNotify,
      };
      if (id) data.id = id;
      http.post('/api/pipeline/pipelines/', data).then(() => {
        message.success('保存成功');
        history.push('/pipeline/list');
      }).finally(() => setLoading(false));
    });
  }

  function moveAction(actions, setActions, index, dir) {
    const target = index + dir;
    if (target < 0 || target >= actions.length) return;
    const newList = [...actions];
    [newList[index], newList[target]] = [newList[target], newList[index]];
    setActions(newList);
  }

  function updateAction(actions, setActions, index, field, value) {
    const newList = [...actions];
    newList[index] = { ...newList[index], [field]: value };
    setActions(newList);
  }

  function removeAction(actions, setActions, index) {
    setActions(actions.filter((_, i) => i !== index));
  }

  function addVariable() {
    setVariables([...variables, { name: '', value: '' }]);
  }

  function updateVariable(idx, field, value) {
    const newList = [...variables];
    newList[idx] = { ...newList[idx], [field]: value };
    setVariables(newList);
  }

  function removeVariable(idx) {
    setVariables(variables.filter((_, i) => i !== idx));
  }

  return (
    <AuthDiv auth="pipeline.pipeline.add|pipeline.pipeline.edit">
      <Breadcrumb items={['首页', '流水线', id ? '编辑流水线' : '新建流水线']} />
      <div className={style.editor}>
        <div className={style.header}>
          <Form form={form} layout="inline" initialValues={{ is_parallel: true, is_audit: false, is_active: true }}>
            <Form.Item name="name" rules={[{ required: true, message: '请输入流水线名称' }]}>
              <Input placeholder="流水线名称" style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="desc">
              <Input placeholder="描述" style={{ width: 300 }} />
            </Form.Item>
            <Form.Item name="is_parallel" valuePropName="checked">
              <Switch checkedChildren="并行" unCheckedChildren="串行" />
            </Form.Item>
            <Form.Item name="is_audit" valuePropName="checked">
              <Switch checkedChildren="审核" unCheckedChildren="免审" />
            </Form.Item>
            <Form.Item name="is_active" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="禁用" />
            </Form.Item>
          </Form>
          <Space>
            <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={handleSave}>保存</Button>
            <Button onClick={() => history.push('/pipeline/list')}>取消</Button>
          </Space>
        </div>

        <Alert
          type="info"
          showIcon
          message="执行顺序说明"
          description="Spug 将遵循先本地后目标主机的原则，按照顺序依次执行添加的动作：本地动作1 -> 本地动作2 -> 目标主机动作1 -> 目标主机动作2 ..."
          style={{ marginBottom: 16 }}
        />

        <Form labelCol={{ span: 6 }} wrapperCol={{ span: 14 }}>
          <Form.Item label="目标主机">
            <HostSelector value={hostIds} onChange={setHostIds} />
          </Form.Item>

          {serverActions.map((item, index) => (
            <div key={index} className={style.actionItem}>
              <Form.Item required label={`本地动作${index + 1}`}>
                <Input value={item.title} onChange={e => updateAction(serverActions, setServerActions, index, 'title', e.target.value)} placeholder="请输入动作名称" />
              </Form.Item>
              <Form.Item required label="执行内容">
                <ACEditor
                  mode="sh"
                  theme="tomorrow"
                  width="100%"
                  height="100px"
                  value={item.data}
                  onChange={v => updateAction(serverActions, setServerActions, index, 'data', cleanCommand(v))}
                  placeholder="请输入要执行的动作"
                />
              </Form.Item>
              <Button type="dashed" icon={<UpOutlined />} className={style.upAction} onClick={() => moveAction(serverActions, setServerActions, index, -1)} />
              <Button type="dashed" icon={<DownOutlined />} className={style.downAction} onClick={() => moveAction(serverActions, setServerActions, index, 1)} />
              <div className={style.delAction} onClick={() => removeAction(serverActions, setServerActions, index)}>
                <MinusCircleOutlined />移除
              </div>
            </div>
          ))}
          <Form.Item wrapperCol={{ span: 14, offset: 6 }}>
            <Button type="dashed" block icon={<PlusOutlined />} onClick={() => setServerActions([...serverActions, {}])}>
              添加本地执行动作（在服务端本地执行）
            </Button>
          </Form.Item>

          <Divider />

          {hostActions.map((item, index) => (
            <div key={index} className={style.actionItem}>
              <Form.Item required label={`目标主机动作${index + 1}`}>
                <Input value={item.title} onChange={e => updateAction(hostActions, setHostActions, index, 'title', e.target.value)} placeholder="请输入动作名称" />
              </Form.Item>
              <Form.Item required label="执行内容">
                <ACEditor
                  mode="sh"
                  theme="tomorrow"
                  width="100%"
                  height="100px"
                  value={item.data}
                  onChange={v => updateAction(hostActions, setHostActions, index, 'data', cleanCommand(v))}
                  placeholder="请输入要执行的动作"
                />
              </Form.Item>
              <Button type="dashed" icon={<UpOutlined />} className={style.upAction} onClick={() => moveAction(hostActions, setHostActions, index, -1)} />
              <Button type="dashed" icon={<DownOutlined />} className={style.downAction} onClick={() => moveAction(hostActions, setHostActions, index, 1)} />
              <div className={style.delAction} onClick={() => removeAction(hostActions, setHostActions, index)}>
                <MinusCircleOutlined />移除
              </div>
            </div>
          ))}
          <Form.Item wrapperCol={{ span: 14, offset: 6 }}>
            <Button type="dashed" block icon={<PlusOutlined />} onClick={() => setHostActions([...hostActions, {}])}>
              添加目标主机执行动作（在部署目标主机执行）
            </Button>
          </Form.Item>

          <Divider />

          <Form.Item label="变量定义">
            <div className={style.variables}>
              {variables.map((v, idx) => (
                <Space key={idx} style={{ marginBottom: 8 }}>
                  <Input placeholder="变量名" value={v.name} onChange={e => updateVariable(idx, 'name', e.target.value)} style={{ width: 150 }} />
                  <Input placeholder="默认值" value={v.value} onChange={e => updateVariable(idx, 'value', e.target.value)} style={{ width: 250 }} />
                  <Button danger icon={<MinusCircleOutlined />} onClick={() => removeVariable(idx)} />
                </Space>
              ))}
              <Button type="dashed" icon={<PlusOutlined />} onClick={addVariable}>添加变量</Button>
            </div>
          </Form.Item>

          <Form.Item label="执行通知">
            <Space>
              <Select value={rstNotify.mode} onChange={v => setRstNotify({ ...rstNotify, mode: v })} style={{ width: 120 }}>
                <Select.Option value="0">不通知</Select.Option>
                <Select.Option value="1">执行通知</Select.Option>
              </Select>
              {rstNotify.mode !== '0' && (
                <Input placeholder="通知对象" value={rstNotify.value} onChange={e => setRstNotify({ ...rstNotify, value: e.target.value })} style={{ width: 250 }} />
              )}
            </Space>
          </Form.Item>
        </Form>
      </div>
    </AuthDiv>
  );
}

export default observer(PipelineEditor);
