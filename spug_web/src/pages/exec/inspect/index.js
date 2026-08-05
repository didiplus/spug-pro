import React from 'react';
import { observer } from 'mobx-react';
import { Input, Select } from 'antd';
import { SearchForm, AuthDiv, Breadcrumb } from 'components';
import ComTable from './Table';
import ComForm from './TaskForm';
import ResultView from './ResultView';
import store from './store';

export default observer(function () {
  return (
    <AuthDiv auth="exec.inspect.view">
      <Breadcrumb items={['首页', '批量执行', '巡检任务']} />
      <SearchForm>
        <SearchForm.Item span={8} title="任务名称">
          <Input allowClear value={store.f_name} onChange={e => store.f_name = e.target.value} placeholder="请输入"/>
        </SearchForm.Item>
        <SearchForm.Item span={8} title="执行状态">
          <Select allowClear value={store.f_status} onChange={v => store.f_status = v} placeholder="请选择">
            <Select.Option value="success">正常</Select.Option>
            <Select.Option value="warning">告警</Select.Option>
            <Select.Option value="error">失败</Select.Option>
            <Select.Option value="pending">待执行</Select.Option>
          </Select>
        </SearchForm.Item>
      </SearchForm>
      <ComTable/>
      {store.formVisible && <ComForm/>}
      {store.resultVisible && <ResultView/>}
    </AuthDiv>
  );
})
