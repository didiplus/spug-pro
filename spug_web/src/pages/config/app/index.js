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
import Rel from './Rel';
import store from './store';

export default observer(function () {
  return (
    <AuthDiv auth="config.app.view">
      <Breadcrumb items={['首页', '配置中心', '应用配置']} />
      <SearchForm>
        <SearchForm.Item span={8} title="应用名称">
          <Input allowClear value={store.f_name} onChange={e => store.f_name = e.target.value} placeholder="请输入"/>
        </SearchForm.Item>
      </SearchForm>
      <ComTable/>
      {store.formVisible && <ComForm/>}
      {store.relVisible && <Rel/>}
    </AuthDiv>
  )
})
