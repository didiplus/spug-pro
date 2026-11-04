import React, { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { Form, Input, Select, Button, Radio, App, Space, Divider } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { LinkButton, ACEditor } from 'components';
import TemplateSelector from '../exec/task/TemplateSelector';
import { cleanCommand, http } from 'libs';
import store from './store';
import styles from './index.module.css';

export default observer(function () {
  const [form] = Form.useForm();
  const [showTmp, setShowTmp] = useState(false);
  const [command, setCommand] = useState(store.record.command || '');
  const [rstValue, setRstValue] = useState({});
  const [contacts, setContacts] = useState([]);

  const { modal } = App.useApp();

  const mountedRef = useRef(true);
  const abortControllerRef = useRef(null);
  const timerRef = useRef(null);


  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const { mode, value } = store.record.rst_notify;
    setRstValue({ [mode]: value });

    http.get('/api/alarm/contact/?only_push=1', { signal: controller.signal })
      .then(res => {
        if (mountedRef.current) {
          setContacts(res);
        }
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        console.error('加载联系人失败:', err);
      });


    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  function handleAddZone() {
    let type;
    modal.confirm({
      icon: <ExclamationCircleOutlined />,
      title: '添加任务类型',
      content: (
        <Form layout="horizontal" style={{ marginTop: 24 }}>
          <Form.Item required label="任务类型">
            <Input onChange={e => type = e.target.value} />
          </Form.Item>
        </Form>
      ),
      onOk: () => {
        if (!mountedRef.current) return;
        if (type) {
          timerRef.current = setTimeout(() => {
            if (mountedRef.current) {
              store.types.push(type);
              form.setFieldsValue({ type });
            }
          }, 0);
        }
      },
    });
  }

  function canNext() {
    const formData = form.getFieldsValue();
    return !(formData.type && formData.name && command);
  }

  function handleNext() {
    const notifyMode = store.record.rst_notify.mode;
    store.record.rst_notify.value = rstValue[notifyMode];
    const formData = form.getFieldsValue();
    Object.assign(store.record, formData, { command: cleanCommand(command) });
    store.page += 1;
  }

  function handleSelect(tpl) {
    if (!mountedRef.current) return;
    const { interpreter, body } = tpl;
    setCommand(body);
    form.setFieldsValue({ interpreter });
  }

  let modePlaceholder;
  switch (store.record.rst_notify.mode) {
    case '0':
      modePlaceholder = '已关闭';
      break;
    case '1':
      modePlaceholder = 'https://oapi.dingtalk.com/robot/send?access_token=xxx';
      break;
    case '3':
      modePlaceholder = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx';
      break;
    case '4':
      modePlaceholder = 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx';
      break;
    default:
      modePlaceholder = '请输入';
  }

  const notifyMode = store.record.rst_notify.mode;

  return (
    <Form form={form} initialValues={store.record} labelCol={{ span: 6 }} wrapperCol={{ span: 14 }}>
      <div className={styles.sectionTitle}>基本信息</div>
      <Form.Item required label="任务类型" style={{ marginBottom: 0 }}>
        <Form.Item name="type" style={{ display: 'inline-block', width: '80%' }}>
          <Select placeholder="请选择任务类型">
            {store.types.map(item => (
              <Select.Option value={item} key={item}>{item}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item style={{ display: 'inline-block', width: '20%', textAlign: 'right' }}>
          <Button type="link" onClick={handleAddZone}>添加类型</Button>
        </Form.Item>
      </Form.Item>
      <Form.Item required name="name" label="任务名称">
        <Input placeholder="请输入任务名称" />
      </Form.Item>

      <Divider style={{ margin: '8px 0' }} />

      <div className={styles.sectionTitle}>任务内容</div>
      <Form.Item required label="任务内容" extra={<LinkButton onClick={() => setShowTmp(true)}>从模板添加</LinkButton>}>
        <Form.Item noStyle name="interpreter">
          <Radio.Group buttonStyle="solid" style={{ marginBottom: 12 }}>
            <Radio.Button value="sh" style={{ width: 80, textAlign: 'center' }}>Shell</Radio.Button>
            <Radio.Button value="python" style={{ width: 80, textAlign: 'center' }}>Python</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue }) => (
            <div className={styles.editorWrap}>
              <ACEditor
                mode={getFieldValue('interpreter')}
                value={command}
                width="100%"
                height="150px"
                onChange={setCommand}
              />
            </div>
          )}
        </Form.Item>
      </Form.Item>

      <Divider style={{ margin: '8px 0' }} />

      <div className={styles.sectionTitle}>通知与备注</div>
      <Form.Item
        label="失败通知"
        extra={(
          <span className={styles.notifyExtra}>
            任务执行失败告警通知，
            <a target="_blank" rel="noopener noreferrer" href="https://ops.spug.cc/docs/use-problem#use-dd">
              钉钉收不到通知？
            </a>
          </span>
        )}
      >
        <Space.Compact style={{ width: '100%' }}>
          <Select
            style={{ width: '25%' }}
            value={notifyMode}
            onChange={v => store.record.rst_notify.mode = v}
          >
            <Select.Option value="0">关闭</Select.Option>
            <Select.Option value="1">钉钉</Select.Option>
            <Select.Option value="4">飞书</Select.Option>
            <Select.Option value="3">企业微信</Select.Option>
            <Select.Option value="2">Webhook</Select.Option>
            <Select.Option value="5">推送助手</Select.Option>
          </Select>

          {notifyMode === '5' ? (
            <Select
              mode="multiple"
              style={{ width: '75%' }}
              value={rstValue[notifyMode]}
              onChange={v => setRstValue(Object.assign({}, rstValue, { [notifyMode]: v }))}
              placeholder="请选择推送对象"
            >
              {contacts.map(item => (
                <Select.Option value={item.id} key={item.id}>{item.name}</Select.Option>
              ))}
            </Select>
          ) : (
            <Input
              style={{ width: '75%' }}
              value={rstValue[notifyMode]}
              onChange={e => setRstValue(Object.assign({}, rstValue, { [notifyMode]: e.target.value }))}
              disabled={notifyMode === '0'}
              placeholder={modePlaceholder}
            />
          )}
        </Space.Compact>
      </Form.Item>
      <Form.Item name="desc" label="备注信息">
        <Input.TextArea placeholder="请输入任务备注信息" />
      </Form.Item>
      <Form.Item shouldUpdate wrapperCol={{ span: 14, offset: 6 }}>
        {() => <Button disabled={canNext()} type="primary" onClick={handleNext}>下一步</Button>}
      </Form.Item>
      {showTmp && <TemplateSelector onOk={handleSelect} onCancel={() => setShowTmp(false)} />}
    </Form>
  );
});
