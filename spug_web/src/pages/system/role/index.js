/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import { observer } from 'mobx-react';
import { Input } from 'antd';
import { SearchForm, AuthDiv, Breadcrumb } from 'components';
import ComTable from './Table';
import ComForm from './Form';
import PagePerm from './PagePerm';
import DeployPerm from './DeployPerm';
import HostPerm from './HostPerm';
import store from './store';

export default observer(function () {
  return (
    <AuthDiv auth="system.role.view">
      <Breadcrumb items={['首页', '系统管理', '角色管理']} />
      <SearchForm>
        <SearchForm.Item span={8} title="角色名称">
          <Input allowClear value={store.f_name} onChange={e => store.f_name = e.target.value} placeholder="请输入"/>
        </SearchForm.Item>
      </SearchForm>
      <ComTable/>
      {store.formVisible && <ComForm/>}
      {store.pagePermVisible && <PagePerm/>}
      {store.deployPermVisible && <DeployPerm/>}
      {store.hostPermVisible && <HostPerm/>}
    </AuthDiv>
  );
})
