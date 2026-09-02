import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { Input, Tree, Typography, Tag, Flex, Empty, Spin } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { http } from 'libs';
import { AuthDiv, Breadcrumb } from 'components';

const { Text, Paragraph } = Typography;

const CATEGORY_LABELS = {
  files: '文件操作',
  packages: '包管理',
  services: '服务管理',
  network: '网络',
  commands: '命令执行',
  system: '系统管理',
  monitoring: '监控/调试',
};

function ModulesIndex() {
  const [categories, setCategories] = useState({});
  const [modules, setModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    http.get('/api/ansible/modules/')
      .then(res => {
        setCategories(res.categories);
        setModules(res.modules);
      })
  }, []);

  function loadDoc(name) {
    setSelectedModule(name);
    setDoc(null);
    setLoading(true);
    http.get(`/api/ansible/modules/${name}/`)
      .then(res => setDoc(res))
      .finally(() => setLoading(false))
  }

  const treeData = Object.entries(categories).map(([key, mods]) => ({
    key: `cat_${key}`,
    title: CATEGORY_LABELS[key] || key,
    children: mods.map(m => ({key: `mod_${m}`, title: m, isLeaf: true})),
  }));

  const filteredModules = search
    ? modules.filter(m => m.includes(search.toLowerCase()))
    : modules;

  return (
    <AuthDiv auth="ansible.modules.view">
      <Breadcrumb items={['首页', 'Ansible', 'Module 浏览器']}/>
      <Flex gap={16} style={{height: 'calc(100vh - 120px)'}}>
        <div style={{width: 250, background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto'}}>
          <Input
            allowClear
            prefix={<SearchOutlined/>}
            placeholder="搜索模块"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{marginBottom: 12}}/>
          {search ? (
            <div>
              {filteredModules.map(m => (
                <div
                  key={m}
                  onClick={() => loadDoc(m)}
                  style={{
                    padding: '6px 12px',
                    cursor: 'pointer',
                    borderRadius: 4,
                    background: selectedModule === m ? '#e6f4ff' : 'transparent',
                    fontSize: 13,
                  }}>
                  {m}
                </div>
              ))}
            </div>
          ) : (
            <Tree
              treeData={treeData}
              onSelect={(keys) => {
                const key = keys[0];
                if (key && key.startsWith('mod_')) {
                  loadDoc(key.slice(4));
                }
              }}/>
          )}
        </div>
        <div style={{flex: 1, background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto'}}>
          {loading ? (
            <div style={{textAlign: 'center', padding: 40}}><Spin/></div>
          ) : doc ? (
            <ModuleDoc name={selectedModule} doc={doc}/>
          ) : (
            <Empty description="请选择一个模块查看文档"/>
          )}
        </div>
      </Flex>
    </AuthDiv>
  )
}

function ModuleDoc({name, doc}) {
  const docs = doc?.[name] || doc || {};
  const docData = docs.doc || docs;
  return (
    <div>
      <Flex align="center" gap={8} style={{marginBottom: 16}}>
        <Text strong style={{fontSize: 18}}>{name}</Text>
        <Tag color="blue">module</Tag>
      </Flex>
      {docData.short_description && (
        <Paragraph>{docData.short_description}</Paragraph>
      )}
      {docData.description && (
        <div style={{marginBottom: 16}}>
          <Text strong>描述</Text>
          <Paragraph>{Array.isArray(docData.description) ? docData.description.join('\n') : docData.description}</Paragraph>
        </div>
      )}
      {docData.options && (
        <div style={{marginBottom: 16}}>
          <Text strong>参数</Text>
          <div style={{marginTop: 8}}>
            {Object.entries(docData.options).map(([key, opt]) => (
              <div key={key} style={{padding: '8px 0', borderBottom: '1px solid var(--color-border-secondary)'}}>
                <Flex align="center" gap={8}>
                  <Text strong style={{color: '#2563fc'}}>{key}</Text>
                  {opt.required && <Tag color="red">required</Tag>}
                  {opt.type && <Tag>{opt.type}</Tag>}
                  {opt.default !== undefined && <Tag color="default">default: {String(opt.default)}</Tag>}
                </Flex>
                {opt.description && (
                  <Text type="secondary" style={{fontSize: 12}}>
                    {Array.isArray(opt.description) ? opt.description.join(' ') : opt.description}
                  </Text>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {docData.examples && (
        <div style={{marginBottom: 16}}>
          <Text strong>示例</Text>
          <pre style={{
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: 12,
            borderRadius: 8,
            fontSize: 12,
            overflow: 'auto',
            marginTop: 8,
          }}>{docData.examples}</pre>
        </div>
      )}
      {docData.notes && (
        <div>
          <Text strong>备注</Text>
          <Paragraph>
            {Array.isArray(docData.notes) ? docData.notes.map((n, i) => <div key={i}>- {n}</div>) : docData.notes}
          </Paragraph>
        </div>
      )}
    </div>
  )
}

export default observer(ModulesIndex);