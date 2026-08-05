/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useState } from 'react';
import { observer } from 'mobx-react';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { message } from 'libs/message';
import { Form, Input, Select, Button, App } from 'antd';
import TemplateSelector from '../exec/task/TemplateSelector';
import HostSelector from 'pages/host/Selector';
import { LinkButton, ACEditor } from 'components';
import { http, cleanCommand } from 'libs';
import store from './store';
import lds from 'lodash';

const helpMap = {
  '1': '返回HTTP状态码200-399则判定为正常，其他为异常。',
  '4': '脚本执行退出状态码为 0 则判定为正常，其他为异常。',
  '6': '高级HTTP检测，支持自定义方法/请求头/请求体/期望状态码/响应时间阈值。',
  '7': '数据库连接检测，支持MySQL/PostgreSQL，执行SQL并校验返回结果。',
  '8': '日志关键词检测，在指定主机的日志文件中搜索关键词，匹配到则异常。',
  '9': 'Prometheus指标检测，执行PromQL查询并与阈值比较，超出则异常。'
}

function getExtraField(field, defaultVal) {
  try {
    const config = JSON.parse(store.record.extra || '{}');
    return config[field] ?? defaultVal;
  } catch {
    return defaultVal;
  }
}

function setExtraField(field, value) {
  let config = {};
  try {
    config = JSON.parse(store.record.extra || '{}');
  } catch (e) {}
  config[field] = value;
  store.record.extra = JSON.stringify(config);
}

export default observer(function () {
  const [loading, setLoading] = useState(false);
  const [showTmp, setShowTmp] = useState(false);
  const { modal } = App.useApp();
  function handleTest() {
    setLoading(true)
    const formData = lds.pick(store.record, ['type', 'targets', 'extra'])
    http.post('/api/monitor/test/', formData, {timeout: 120000})
      .then(res => {
        if (res.is_success) {
          modal.success({content: res.message})
        } else {
          modal.warning({content: res.message})
        }
      })
      .finally(() => setLoading(false))
  }

  function handleChangeType(v) {
    store.record.type = v;
    store.record.targets = [];
    store.record.extra = ['6', '7', '8', '9'].includes(v) ? '{}' : undefined;
  }

  function handleAddGroup() {
    modal.confirm({
      icon: <ExclamationCircleOutlined/>,
      title: '添加监控分组',
      content: (
        <Form layout="horizontal" style={{marginTop: 24}}>
          <Form.Item required label="监控分组">
            <Input onChange={e => store.record.group = e.target.value}/>

          </Form.Item>
        </Form>
      ),
      onOk: () => {
        if (store.record.group) {
          store.groups.push(store.record.group);
        }
      },
    })
  }

  function canNext() {
    const {type, targets, extra, group} = store.record;
    const is_verify = name && group && targets.length;
    if (['2', '3', '4', '6', '7', '8', '9'].includes(type)) {
      return is_verify && extra
    } else {
      return is_verify
    }
  }

  function toNext() {
    const {type, extra} = store.record;
    if (!Number(extra) > 0) {
      if (type === '1' && extra) return message.error('请输入正确的响应时间')
      if (type === '2') return message.error('请输入正确的端口号')
    }
    if (['6', '7', '8', '9'].includes(type)) {
      try { JSON.parse(extra) } catch (e) { return message.error('检测配置格式错误，请检查') }
    }
    store.page += 1;
  }

  function getStyle(t) {
    return t.includes(store.record.type) ? {} : {display: 'none'}
  }

  const {name, desc, type, targets, extra, group} = store.record;
  return (
    <Form labelCol={{span: 6}} wrapperCol={{span: 14}}>
      <Form.Item required label="监控分组" style={{marginBottom: 0}}>
        <Form.Item style={{display: 'inline-block', width: 'calc(75%)', marginRight: 8}}>
          <Select value={group} placeholder="请选择监控分组" onChange={v => store.record.group = v}>
            {store.groups.map(item => (
              <Select.Option value={item} key={item}>{item}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item style={{display: 'inline-block', width: 'calc(25%-8px)'}}>
          <Button type="link" onClick={handleAddGroup}>添加分组</Button>
        </Form.Item>
      </Form.Item>
      <Form.Item label="监控类型" tooltip={helpMap[type]}>
        <Select placeholder="请选择监控类型" value={type} onChange={handleChangeType}>
          <Select.Option value="1">站点检测</Select.Option>
          <Select.Option value="2">端口检测</Select.Option>
          <Select.Option value="5">Ping检测</Select.Option>
          <Select.Option value="3">进程检测</Select.Option>
          <Select.Option value="4">自定义脚本</Select.Option>
          <Select.Option value="6">HTTP高级检测</Select.Option>
          <Select.Option value="7">数据库检测</Select.Option>
          <Select.Option value="8">日志关键词检测</Select.Option>
          <Select.Option value="9">Prometheus检测</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item required label="监控名称">
        <Input value={name} onChange={e => store.record.name = e.target.value} placeholder="请输入监控名称"/>
      </Form.Item>
      <Form.Item required label="监控地址" style={getStyle(['1'])}>
        <Select
          mode="tags"
          value={targets}
          tokenSeparators={[',', ' ']}
          onChange={v => store.record.targets = v}
          placeholder="http(s)://开头，支持多个地址，每输入完成一个后按回车确认"
          notFoundContent={null}/>
      </Form.Item>
      <Form.Item required label="监控地址" style={getStyle(['2', '5'])}>
        <Select
          mode="tags"
          value={targets}
          tokenSeparators={[',', ' ']}
          onChange={v => store.record.targets = v}
          placeholder="IP或域名，支持多个地址，每输入完成一个后按回车确认"
          notFoundContent={null}/>
      </Form.Item>
      <Form.Item required label="监控主机" style={getStyle(['3', '4'])}>
        <HostSelector value={targets} onChange={ids => store.record.targets = ids}/>
      </Form.Item>
      <Form.Item label="响应时间" style={getStyle(['1'])}>
        <Input suffix="ms" value={extra} placeholder="最长响应时间（毫秒），不设置则默认10秒超时"
               onChange={e => store.record.extra = e.target.value}/>
      </Form.Item>
      <Form.Item required label="检测端口" style={getStyle(['2'])}>
        <Input value={extra} placeholder="请输入端口号" onChange={e => store.record.extra = e.target.value}/>
      </Form.Item>
      <Form.Item required label="进程名称" extra="执行 ps -ef 看到的进程名称。" style={getStyle(['3'])}>
        <Input value={extra} placeholder="请输入进程名称" onChange={e => store.record.extra = e.target.value}/>
      </Form.Item>
      <Form.Item
        required
        label="脚本内容"
        style={getStyle(['4'])}
        extra={<LinkButton onClick={() => setShowTmp(true)}>从模板添加</LinkButton>}>
        <ACEditor
          mode="sh"
          value={extra || ''}
          width="100%"
          height="200px"
          onChange={e => store.record.extra = cleanCommand(e)}/>
      </Form.Item>

      {/* Type 6: HTTP高级检测 */}
      <Form.Item required label="监控地址" style={getStyle(['6'])}>
        <Select
          mode="tags"
          value={targets}
          tokenSeparators={[',', ' ']}
          onChange={v => store.record.targets = v}
          placeholder="http(s)://开头，支持多个地址，每输入完成一个后按回车确认"
          notFoundContent={null}/>
      </Form.Item>
      <Form.Item label="请求方法" style={getStyle(['6'])}>
        <Select value={getExtraField('method', 'GET')} onChange={v => setExtraField('method', v)}>
          <Select.Option value="GET">GET</Select.Option>
          <Select.Option value="POST">POST</Select.Option>
          <Select.Option value="PUT">PUT</Select.Option>
          <Select.Option value="DELETE">DELETE</Select.Option>
          <Select.Option value="HEAD">HEAD</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item label="请求头(JSON)" style={getStyle(['6'])}>
        <Input.TextArea
          rows={3}
          value={getExtraField('headers', '')}
          placeholder='{"Content-Type": "application/json"}'
          onChange={e => setExtraField('headers', e.target.value)}/>
      </Form.Item>
      <Form.Item label="请求体" style={getStyle(['6'])}>
        <Input.TextArea
          rows={3}
          value={getExtraField('body', '')}
          placeholder="请求体内容（POST/PUT适用）"
          onChange={e => setExtraField('body', e.target.value)}/>
      </Form.Item>
      <Form.Item label="期望状态码" style={getStyle(['6'])}>
        <Input
          value={getExtraField('expected_codes', '200-399')}
          placeholder="如 200-399 或 200,201,204"
          onChange={e => setExtraField('expected_codes', e.target.value)}/>
      </Form.Item>
      <Form.Item label="响应时间阈值" style={getStyle(['6'])}>
        <Input
          suffix="ms"
          value={getExtraField('max_response_time', '')}
          placeholder="最长响应时间（毫秒），不设置则不检测"
          onChange={e => setExtraField('max_response_time', e.target.value)}/>
      </Form.Item>

      {/* Type 7: 数据库检测 */}
      <Form.Item required label="数据库地址" style={getStyle(['7'])}>
        <Select
          mode="tags"
          value={targets}
          tokenSeparators={[',', ' ']}
          onChange={v => store.record.targets = v}
          placeholder="IP或域名，支持多个地址，每输入完成一个后按回车确认"
          notFoundContent={null}/>
      </Form.Item>
      <Form.Item required label="数据库类型" style={getStyle(['7'])}>
        <Select value={getExtraField('db_type', 'mysql')} onChange={v => setExtraField('db_type', v)}>
          <Select.Option value="mysql">MySQL</Select.Option>
          <Select.Option value="postgresql">PostgreSQL</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item required label="端口" style={getStyle(['7'])}>
        <Input
          value={getExtraField('port', 3306)}
          placeholder="请输入端口号"
          onChange={e => setExtraField('port', e.target.value)}/>
      </Form.Item>
      <Form.Item required label="用户名" style={getStyle(['7'])}>
        <Input
          value={getExtraField('username', '')}
          placeholder="数据库用户名"
          onChange={e => setExtraField('username', e.target.value)}/>
      </Form.Item>
      <Form.Item required label="密码" style={getStyle(['7'])}>
        <Input.Password
          value={getExtraField('password', '')}
          placeholder="数据库密码"
          onChange={e => setExtraField('password', e.target.value)}/>
      </Form.Item>
      <Form.Item required label="检测SQL" style={getStyle(['7'])}>
        <Input.TextArea
          rows={2}
          value={getExtraField('sql', '')}
          placeholder="如 SELECT 1"
          onChange={e => setExtraField('sql', e.target.value)}/>
      </Form.Item>
      <Form.Item label="期望结果" style={getStyle(['7'])}>
        <Input
          value={getExtraField('expected', '')}
          placeholder="期望返回值（可选）"
          onChange={e => setExtraField('expected', e.target.value)}/>
      </Form.Item>

      {/* Type 8: 日志关键词检测 */}
      <Form.Item required label="监控主机" style={getStyle(['8'])}>
        <HostSelector value={targets} onChange={ids => store.record.targets = ids}/>
      </Form.Item>
      <Form.Item required label="日志文件路径" style={getStyle(['8'])}>
        <Input
          value={getExtraField('file_path', '')}
          placeholder="如 /var/log/app/error.log"
          onChange={e => setExtraField('file_path', e.target.value)}/>
      </Form.Item>
      <Form.Item required label="关键词" style={getStyle(['8'])}>
        <Input
          value={getExtraField('keyword', '')}
          placeholder="匹配到此关键词则判定为异常"
          onChange={e => setExtraField('keyword', e.target.value)}/>
      </Form.Item>
      <Form.Item label="检查行数" style={getStyle(['8'])}>
        <Input
          value={getExtraField('lines', 100)}
          placeholder="检查最后N行日志，默认100"
          onChange={e => setExtraField('lines', e.target.value)}/>
      </Form.Item>

      {/* Type 9: Prometheus检测 */}
      <Form.Item required label="Prometheus地址" style={getStyle(['9'])}>
        <Select
          mode="tags"
          value={targets}
          tokenSeparators={[',', ' ']}
          onChange={v => store.record.targets = v}
          placeholder="http(s)://prometheus:9090，支持多个地址"
          notFoundContent={null}/>
      </Form.Item>
      <Form.Item required label="PromQL查询" style={getStyle(['9'])}>
        <Input.TextArea
          rows={2}
          value={getExtraField('query', '')}
          placeholder="如 up{job='node'}"
          onChange={e => setExtraField('query', e.target.value)}/>
      </Form.Item>
      <Form.Item required label="比较运算符" style={getStyle(['9'])}>
        <Select value={getExtraField('operator', '<')} onChange={v => setExtraField('operator', v)}>
          <Select.Option value=">">大于 &gt;</Select.Option>
          <Select.Option value="<">小于 &lt;</Select.Option>
          <Select.Option value=">=">大于等于 &gt;=</Select.Option>
          <Select.Option value="<=">小于等于 &lt;=</Select.Option>
          <Select.Option value="==">等于 ==</Select.Option>
          <Select.Option value="!=">不等于 !=</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item required label="阈值" style={getStyle(['9'])}>
        <Input
          value={getExtraField('value', '')}
          placeholder="阈值数值"
          onChange={e => setExtraField('value', e.target.value)}/>
      </Form.Item>

      <Form.Item label="备注信息">
        <Input.TextArea value={desc} onChange={e => store.record.desc = e.target.value} placeholder="请输入备注信息"/>
      </Form.Item>

      <Form.Item wrapperCol={{span: 14, offset: 6}} style={{marginTop: 12}}>
        <Button disabled={!canNext()} type="primary" onClick={toNext}>下一步</Button>
        <Button disabled={!canNext()} type="link" loading={loading} onClick={handleTest}>执行测试</Button>
        <span style={{color: '#888', fontSize: 12}}>Tips: 仅测试第一个监控地址</span>
      </Form.Item>
      {showTmp && <TemplateSelector onOk={({body}) => store.record.extra = body} onCancel={() => setShowTmp(false)}/>}
    </Form>
  )
})