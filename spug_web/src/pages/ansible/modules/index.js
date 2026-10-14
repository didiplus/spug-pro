import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { Input, Tree, Typography, Tag, Flex, Empty, Spin } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { http } from 'libs';
import { AuthDiv, Breadcrumb } from 'components';
import styles from './modules.module.css';

const { Text, Paragraph } = Typography;

const CATEGORY_LABELS = {
  files: '文件操作',
  packages: '包管理',
  services: '服务管理',
  network: '网络',
  commands: '命令执行',
  system: '系统管理',
  monitoring: '监控/调试',
  cloud: '云/容器',
  database: '数据库',
  source_control: '版本控制',
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
      .catch(() => {})
  }, []);

  function loadDoc(name) {
    setSelectedModule(name);
    setDoc(null);
    setLoading(true);
    http.get(`/api/ansible/modules/${name}/`)
      .then(res => setDoc(res))
      .catch(() => {})
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
      <Flex gap={16} className={styles.container}>
        <div className={styles.sidePanel}>
          <Input
            allowClear
            prefix={<SearchOutlined/>}
            placeholder="搜索模块"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.searchInput}/>
          {search ? (
            <div>
              {filteredModules.map(m => (
                <div
                  key={m}
                  onClick={() => loadDoc(m)}
                  className={`${styles.searchItem} ${selectedModule === m ? styles.searchItemActive : ''}`}>
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
        <div className={styles.docPanel}>
          {loading ? (
            <div className={styles.loadingWrap}><Spin/></div>
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
      <Flex align="center" gap={8} className={styles.docHeader}>
        <Text strong className={styles.docTitle}>{name}</Text>
        <Tag color="blue">module</Tag>
      </Flex>
      {docData.short_description && (
        <Paragraph>{docData.short_description}</Paragraph>
      )}
      {docData.description && (
        <div className={styles.docSection}>
          <Text strong>描述</Text>
          <Paragraph>{Array.isArray(docData.description) ? docData.description.join('\n') : docData.description}</Paragraph>
        </div>
      )}
      {docData.options && (
        <div className={styles.docSection}>
          <Text strong>参数</Text>
          <div className={styles.docOptions}>
            {Object.entries(docData.options).map(([key, opt]) => (
              <div key={key} className={styles.optionItem}>
                <Flex align="center" gap={8}>
                  <Text strong className={styles.optionKey}>{key}</Text>
                  {opt.required && <Tag color="red">required</Tag>}
                  {opt.type && <Tag>{opt.type}</Tag>}
                  {opt.default !== undefined && <Tag color="default">default: {String(opt.default)}</Tag>}
                </Flex>
                {opt.description && (
                  <Text type="secondary" className={styles.optionDesc}>
                    {Array.isArray(opt.description) ? opt.description.join(' ') : opt.description}
                  </Text>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {docData.examples && (
        <div className={styles.docSection}>
          <Text strong>示例</Text>
          <pre className={styles.codeBlock}>{docData.examples}</pre>
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