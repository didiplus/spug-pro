/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import { observer } from 'mobx-react';
import { AuthDiv, Breadcrumb } from 'components';
import ComTable from './Table';
import ComForm from './Form';
import MonitorCard from './MonitorCard';
import store from './store';

export default observer(function () {
  return (
    <AuthDiv auth="monitor.monitor.view">
      <Breadcrumb items={['首页', '监控中心']} />
      <MonitorCard/>
      <ComTable/>
      {store.formVisible && <ComForm/>}
    </AuthDiv>
  )
})
