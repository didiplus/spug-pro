/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Released under the AGPL-3.0 License.
 */
import React, { Suspense } from 'react';
import { Switch, Route } from 'react-router-dom';
import { NotFound } from 'components';


// 创建单个路由
export function makeRoute(path, component) {
  return {subPath: path, component}
}

// 创建模块路由
export function makeModuleRoute(prefix, routes) {
  return {prefix, routes}
}

// 组合路由
export class Router extends React.Component {
  constructor(props) {
    super(props);
    this.routes = [];
    this.initialRoutes();
  }

  initialRoutes() {

  }

  render() {
    return (
      <Suspense fallback={<div>Loading...</div>}>
        <Switch>
          {this.routes.map(route => <Route exact strict key={route.path} {...route}/>)}
          <Route component={NotFound}/>
        </Switch>
      </Suspense>
    )
  }
}
