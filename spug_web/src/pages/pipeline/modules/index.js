import React, { useEffect } from 'react';
import SSHExec from './SSHExec';
import Build from './Build';
import Parameter from './Parameter';
import DataTransfer from './DataTransfer';
import PushWebhook from './PushWebhook';
import PushSpug from './PushSpug';
import { t } from 'libs';

function Empty(props) {
  useEffect(() => {
    props.setHandler(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.node])
  return <div style={{padding: 24, color: '#999'}}>{t('请选择节点模块')}</div>
}

function ModuleConfig(props) {
  switch (props.node.module) {
    case 'ssh_exec':
      return <SSHExec {...props}/>
    case 'build':
      return <Build {...props}/>
    case 'data_transfer':
      return <DataTransfer {...props}/>
    case 'parameter':
      return <Parameter {...props}/>
    case 'push_dd':
    case 'push_fs':
    case 'push_wx':
      return <PushWebhook {...props}/>
    case 'push_spug':
      return <PushSpug {...props}/>
    default:
      return <Empty {...props}/>
  }
}

export default ModuleConfig
