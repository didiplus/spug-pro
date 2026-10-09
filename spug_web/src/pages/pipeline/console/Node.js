import React from 'react';
import { observer } from 'mobx-react';
import { LoadingOutlined, CheckCircleOutlined, ExclamationCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import Icon from '../Icon';
import { clsNames, t } from 'libs';
import S from './store';
import css from './node.module.less';

function ConsoleNode(props) {
  const { node, index, isLast } = props
  const output = S.outputs[String(node.id)] || {}
  const status = output.status
  const isActive = S.node?.id === node.id

  const connectorClass = clsNames(
    css.connector,
    status === 'success' && css.connectorSuccess,
    status === 'error' && css.connectorError,
  )

  return (
    <div className={css.wrapper}>
      {!isLast && <div className={connectorClass}/>}
      <div
        className={clsNames(css.node, isActive && css.active)}
        onClick={() => S.node = node}>
        <div className={clsNames(css.iconWrap, status === 'success' && css.iconSuccess, status === 'error' && css.iconError)}>
          <Icon size={26} module={node.module}/>
        </div>
        <div className={css.info}>
          <div className={css.nameRow}>
            <span className={css.index}>{index}</span>
            <span className={css.title}>{node.name || t('未命名')}</span>
          </div>
          <div className={css.statusRow}>
            {status === 'doing' ? (
              <><LoadingOutlined className={css.iconDoing}/><span className={css.textDoing}>执行中</span></>
            ) : status === 'success' ? (
              <><CheckCircleOutlined className={css.iconSuccess2}/><span className={css.textSuccess}>已完成</span></>
            ) : status === 'error' ? (
              <><ExclamationCircleOutlined className={css.iconError2}/><span className={css.textError}>失败</span></>
            ) : (
              <><ClockCircleOutlined className={css.iconWaiting}/><span className={css.textWaiting}>等待中</span></>
            )}
          </div>
        </div>
        {isActive && <div className={css.activeBar}/>}
      </div>
    </div>
  )
}

export default observer(ConsoleNode)
