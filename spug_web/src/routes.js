/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { lazy, Suspense } from 'react';
import { Spin } from 'antd';
import {
  DashboardOutlined,
  DesktopOutlined,
  CloudServerOutlined,
  CodeOutlined,
  FlagOutlined,
  ScheduleOutlined,
  DeploymentUnitOutlined,
  MonitorOutlined,
  AlertOutlined,
  SettingOutlined,
  PlayCircleOutlined,
  ClusterOutlined,
} from '@ant-design/icons';

const withSuspense = (Comp) => (props) => (
  <Suspense fallback={<Spin/>}>
    <Comp {...props}/>
  </Suspense>
);

export const ComponentRegistry = {
  'pages/home': withSuspense(lazy(() => import('./pages/home'))),
  'pages/dashboard': withSuspense(lazy(() => import('./pages/dashboard'))),
  'pages/host': withSuspense(lazy(() => import('./pages/host'))),
  'pages/database': withSuspense(lazy(() => import('./pages/database'))),
  'pages/exec/task': withSuspense(lazy(() => import('./pages/exec/task'))),
  'pages/exec/template': withSuspense(lazy(() => import('./pages/exec/template'))),
  'pages/exec/transfer': withSuspense(lazy(() => import('./pages/exec/transfer'))),
  'pages/exec/inspect': withSuspense(lazy(() => import('./pages/exec/inspect'))),
  'pages/deploy/app': withSuspense(lazy(() => import('./pages/deploy/app'))),
  'pages/deploy/repository': withSuspense(lazy(() => import('./pages/deploy/repository'))),
  'pages/deploy/request': withSuspense(lazy(() => import('./pages/deploy/request'))),
  'pages/schedule': withSuspense(lazy(() => import('./pages/schedule'))),
  'pages/config/environment': withSuspense(lazy(() => import('./pages/config/environment'))),
  'pages/config/service': withSuspense(lazy(() => import('./pages/config/service'))),
  'pages/config/app': withSuspense(lazy(() => import('./pages/config/app'))),
  'pages/config/setting': withSuspense(lazy(() => import('./pages/config/setting'))),
  'pages/monitor': withSuspense(lazy(() => import('./pages/monitor'))),
  'pages/alarm/alarm': withSuspense(lazy(() => import('./pages/alarm/alarm'))),
  'pages/alarm/group': withSuspense(lazy(() => import('./pages/alarm/group'))),
  'pages/alarm/contact': withSuspense(lazy(() => import('./pages/alarm/contact'))),
  'pages/alarm/policy': withSuspense(lazy(() => import('./pages/alarm/policy'))),
  'pages/playbook': withSuspense(lazy(() => import('./pages/playbook'))),
  'pages/ansible/inventory': withSuspense(lazy(() => import('./pages/ansible/inventory'))),
  'pages/ansible/vault': withSuspense(lazy(() => import('./pages/ansible/vault'))),
  'pages/ansible/facts': withSuspense(lazy(() => import('./pages/ansible/facts'))),
  'pages/ansible/modules': withSuspense(lazy(() => import('./pages/ansible/modules'))),
  'pages/system/account': withSuspense(lazy(() => import('./pages/system/account'))),
  'pages/system/role': withSuspense(lazy(() => import('./pages/system/role'))),
  'pages/system/setting': withSuspense(lazy(() => import('./pages/system/setting'))),
  'pages/system/login': withSuspense(lazy(() => import('./pages/system/login'))),
  'pages/system/operotionlog': withSuspense(lazy(() => import('./pages/system/operotionlog'))),
  'pages/system/menu': withSuspense(lazy(() => import('./pages/system/menu'))),
  'pages/welcome/index': withSuspense(lazy(() => import('./pages/welcome/index'))),
  'pages/welcome/info': withSuspense(lazy(() => import('./pages/welcome/info'))),
};

export const IconRegistry = {
  DesktopOutlined: <DesktopOutlined/>,
  DashboardOutlined: <DashboardOutlined/>,
  CloudServerOutlined: <CloudServerOutlined/>,
  CodeOutlined: <CodeOutlined/>,
  FlagOutlined: <FlagOutlined/>,
  ScheduleOutlined: <ScheduleOutlined/>,
  DeploymentUnitOutlined: <DeploymentUnitOutlined/>,
  MonitorOutlined: <MonitorOutlined/>,
  AlertOutlined: <AlertOutlined/>,
  SettingOutlined: <SettingOutlined/>,
  PlayCircleOutlined: <PlayCircleOutlined/>,
  ClusterOutlined: <ClusterOutlined/>,
};
