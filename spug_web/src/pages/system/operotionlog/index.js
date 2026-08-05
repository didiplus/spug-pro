import React from 'react';
import { observer } from 'mobx-react';
import { Input } from 'antd';
import { SearchForm, AuthDiv, Breadcrumb } from 'components';
import ComTable from './Table';
import store from './store';

export default observer(function () {
  return (
    <AuthDiv auth="system.account.view">
      <Breadcrumb items={['首页', '系统管理', '账户管理']} />
      <SearchForm>
        <SearchForm.Item span={6} title="账户名称">
          <Input
            allowClear
            value={store.f_name}
            onChange={(e) => (store.f_name = e.target.value)}
            onPressEnter={() => { store.current = 1; store.fetchRecords(); }}
            placeholder="请输入"
          />
        </SearchForm.Item>
        <SearchForm.Item span={6} title="登录IP">
          <Input
            allowClear
            value={store.f_ip}
            onChange={(e) => (store.f_ip = e.target.value)}
            onPressEnter={() => { store.current = 1; store.fetchRecords(); }}
            placeholder="请输入"
          />
        </SearchForm.Item>
        <SearchForm.Item span={6} title="模块">
          <Input
            allowClear
            value={store.f_module}
            onChange={(e) => (store.f_module = e.target.value)}
            onPressEnter={() => { store.current = 1; store.fetchRecords(); }}
            placeholder="请输入"
          />
        </SearchForm.Item>
      </SearchForm>
      <ComTable />
    </AuthDiv>
  );
});
