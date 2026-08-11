import React, { useState } from 'react';
import { observer } from 'mobx-react';
import { Input, Select, Tabs } from 'antd';
import { SearchForm, AuthDiv, Breadcrumb } from 'components';
import ComTable from './Table';
import ComForm from './TaskForm';
import ResultView from './ResultView';
import ReportView from './ReportView';
import ItemManage from './items';
import store from './store';

export default observer(function () {
  const [activeTab, setActiveTab] = useState('task');

  return (
    <AuthDiv auth="exec.inspect.view">
      <Breadcrumb items={['首页', '批量执行', '巡检任务']} />
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'task',
            label: '巡检任务',
            children: (
              <>
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
              </>
            ),
          },
          {
            key: 'items',
            label: '巡检项管理',
            children: <ItemManage/>,
          },
        ]}
      />
      {store.formVisible && <ComForm/>}
      {store.resultVisible && <ResultView/>}
      {store.reportVisible && <ReportView/>}
    </AuthDiv>
  );
})
