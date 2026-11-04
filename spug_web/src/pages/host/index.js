/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useEffect } from 'react';
import { observer } from 'mobx-react';
import { Row, Col } from 'antd';
import { AuthDiv, Breadcrumb } from 'components';
import Group from './Group';
import ComTable from './Table';
import ComForm from './Form';
import ComImport from './Import';
import CloudImport from './CloudImport';
import BatchSync from './BatchSync';
import Detail from './Detail';
import Selector from './Selector';
import store from './store';

export default observer(function () {
  useEffect(() => {
    store.initial()
  }, [])



  return (
    <AuthDiv auth="host.host.view">
      <Breadcrumb items={['首页', '主机管理']}  />

      <Row gutter={12}>
        <Col xs={24} sm={24} md={8} lg={6} xl={5}>
          <Group/>
        </Col>
        <Col xs={24} sm={24} md={16} lg={18} xl={19}>
          <ComTable/>
        </Col>
      </Row>

      <Detail/>
      {store.formVisible && <ComForm/>}
      {store.importVisible && <ComImport/>}
      {store.cloudImport && <CloudImport/>}
      {store.syncVisible && <BatchSync/>}
      {store.selectorVisible &&
        <Selector
          mode="group"
          onlySelf={!store.addByCopy}
          onCancel={() => store.selectorVisible = false}
          onChange={store.updateGroup}
        />}
    </AuthDiv>
  );
})
