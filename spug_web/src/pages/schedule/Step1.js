import React, { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { Form, Input, Select, Button, Radio, App, Space, Divider } from 'antd';
import { ExclamationCircleOutlined, DatabaseOutlined } from '@ant-design/icons';
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
  const [dbBackupConfig, setDbBackupConfig] = useState({});
  const [dbList, setDbList] = useState([]);
  const [dbListLoading, setDbListLoading] = useState(false);
  const [storageConfigs, setStorageConfigs] = useState([]);

  const { modal } = App.useApp();

  const mountedRef = useRef(true);
  const abortControllerRef = useRef(null);
  const timerRef = useRef(null);

  const interpreter = Form.useWatch('interpreter', form) || store.record.interpreter;
  const isDbBackup = interpreter === 'db_backup';


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

    if (store.dbInstances.length === 0) {
      store.fetchDbInstances();
    }

    http.get('/api/setting/storage-configs/').then(res => {
      if (mountedRef.current) setStorageConfigs(res || []);
    });

    if (store.record.interpreter === 'db_backup') {
      try {
        const config = JSON.parse(store.record.command || '{}');
        setDbBackupConfig(config);
      } catch {
        setDbBackupConfig({});
      }
    }


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
    if (isDbBackup) {
      return !(formData.type && formData.name && dbBackupConfig.instance_id);
    }

    return !(formData.type && formData.name && command);
  }

  function handleNext() {
    const notifyMode = store.record.rst_notify.mode;
    store.record.rst_notify.value = rstValue[notifyMode];
    const formData = form.getFieldsValue();
    if (isDbBackup) {
      Object.assign(store.record, formData, {
        interpreter: 'db_backup',
        command: JSON.stringify(dbBackupConfig),
      });

    } else {
      Object.assign(store.record, formData, { command: cleanCommand(command) });
    }
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
      <Form.Item required label="任务内容" extra={!isDbBackup && <LinkButton onClick={() => setShowTmp(true)}>从模板添加</LinkButton>}>
        <Form.Item noStyle name="interpreter">
          <Radio.Group buttonStyle="solid" style={{ marginBottom: 12 }}>
            <Radio.Button value="sh" style={{ width: 80, textAlign: 'center' }}>Shell</Radio.Button>
            <Radio.Button value="python" style={{ width: 80, textAlign: 'center' }}>Python</Radio.Button>
            <Radio.Button value="db_backup" style={{ textAlign: 'center' }}><DatabaseOutlined style={{ marginRight: 4 }} />数据库备份</Radio.Button>
          </Radio.Group>
        </Form.Item>
        {isDbBackup ? (
          <div className={styles.dbBackupForm}>
            <Form layout="horizontal" labelCol={{ span: 6 }} wrapperCol={{ span: 16 }}>
              <Form.Item label="数据库实例">
                <Select
                  placeholder="请选择数据库实例"
                  showSearch
                  optionFilterProp="label"
                  value={dbBackupConfig.instance_id}
                  onChange={(v) => {
                    setDbBackupConfig({ instance_id: v, database: '', mode: dbBackupConfig.mode || 'full' });
                    setDbList([]);
                    if (v) {
                      setDbListLoading(true);
                      http.get(`/api/db/instances/${v}/`)
                        .then((res) => {
                          const rows = res?.live?.databases?.rows || [];
                          setDbList(rows.map((r) => r.name));
                        })
                        .catch(() => setDbList([]))
                        .finally(() => setDbListLoading(false));
                    }
                  }}
                >
                  {store.dbInstances.map((item) => (
                    <Select.Option key={item.id} value={item.id} label={`${item.name} (${item.host}:${item.port})`}>
                      {item.name} ({item.host}:{item.port})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item label="备份范围">
                <Select
                  placeholder="全部数据库"
                  allowClear
                  loading={dbListLoading}
                  value={dbBackupConfig.database}
                  onChange={(v) => setDbBackupConfig({ ...dbBackupConfig, database: v || '' })}
                  options={[{ label: '全部数据库', value: '' }, ...dbList.map(name => ({ label: name, value: name }))]}
                />
              </Form.Item>
              <Form.Item label="备份类型">
                <Select
                  value={dbBackupConfig.mode || 'full'}
                  onChange={(v) => setDbBackupConfig({ ...dbBackupConfig, mode: v })}
                >
                  <Select.Option value="full">全量备份</Select.Option>
                  <Select.Option value="incremental">增量备份</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item label="远程存储" tooltip="选择后将备份文件上传到远程存储">
                <Select
                  placeholder="仅本地存储"
                  allowClear
                  value={dbBackupConfig.storage_config_id}
                  onChange={(v) => setDbBackupConfig({ ...dbBackupConfig, storage_config_id: v })}
                  options={storageConfigs
                    .filter(c => c.enabled)
                    .map(c => ({ label: `${c.name} (${c.bucket})`, value: c.id }))}
                />
              </Form.Item>
              <Form.Item label="备注">
                <Input.TextArea
                  rows={2}
                  placeholder="可选，最多200字"
                  maxLength={200}
                  value={dbBackupConfig.remark}
                  onChange={(e) => setDbBackupConfig({ ...dbBackupConfig, remark: e.target.value })}
                />
              </Form.Item>
            </Form>
          </div>
        ) : (
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
        )}
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
