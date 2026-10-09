import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { Drawer, Button, message } from 'antd';
import { AppstoreOutlined, SettingOutlined, SaveOutlined } from '@ant-design/icons';
import ModuleConfig from './modules/index';
import Icon from './Icon';
import { clsNames, t } from 'libs';
import S from './store';
import css from './nodeConfig.module.less';
import { NODES, CATEGORIES } from './data';
import lds from 'lodash';

function NodeConfig(props) {
  const [tab, setTab] = useState('node')
  const [loading, setLoading] = useState(false)
  const [handler, setHandler] = useState()

  useEffect(() => {
    setTab(S.node.module ? 'conf' : 'node')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S.node])

  function handleNode({module, name}) {
    S.node.module = module
    if (!S.node.name) S.node.name = name
    setTab('conf')
    S.node = {...S.node}
  }

  function handleSave() {
    if (typeof handler !== 'function') return message.error(t('请选择节点模块'))
    const data = handler()
    if (typeof data === 'object' && data !== null) {
      setLoading(true)
      const basic = lds.pick(S.node, ['id', 'module', 'downstream'])
      S.node = Object.assign(data, basic)
      props.doRefresh(S.node)
        .finally(() => setLoading(false))
    }
  }

  return (
    <Drawer
      open={!!S.node.id}
      width={480}
      mask={false}
      closable={false}
      getContainer={false}
      style={{marginTop: 12, height: 'calc(100% - 12px)'}}
      contentWrapperStyle={{overflow: 'hidden', borderTopLeftRadius: 8}}
      bodyStyle={{padding: 0, position: 'relative', height: '100%'}}>
      <div className={css.container} onMouseDown={e => e.stopPropagation()}>
        <div className={css.header}>
          <div className={clsNames(css.item, tab === 'node' && css.active)} onClick={() => setTab('node')}>
            <AppstoreOutlined/>
            <span>{t('选择模块')}</span>
          </div>
          <div className={clsNames(css.item, tab === 'conf' && css.active)} onClick={() => setTab('conf')}>
            <SettingOutlined/>
            <span>{t('模块配置')}</span>
          </div>
        </div>

        <div className={css.nodeBody} style={{display: tab === 'node' ? 'block' : 'none'}}>
          {CATEGORIES.map(cat => (
            <div key={cat.key}>
              <div className={css.category}>{cat.label}</div>
              <div className={css.items}>
                {NODES.filter(n => n.category === cat.key).map(item => (
                  <div key={item.module} className={clsNames(css.item, S.node?.module === item.module && css.active)}
                       onClick={() => handleNode(item)}>
                    <Icon size={32} module={item.module}/>
                    <div className={css.title}>{item.name}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className={css.body} style={{display: tab === 'conf' ? 'block' : 'none'}}>
          <ModuleConfig node={S.node} setHandler={setHandler}/>
        </div>

        <div className={css.footer} style={{display: tab === 'conf' ? 'block' : 'none'}}>
          <Button icon={<SaveOutlined/>} size="middle" type="primary" loading={loading} onClick={handleSave}>{t('保存')}</Button>
        </div>
      </div>
    </Drawer>
  )
}

export default observer(NodeConfig)