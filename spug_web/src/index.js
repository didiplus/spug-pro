/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { Router } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import './index.less';
import App from './App';
import moment from 'moment';
import 'moment/locale/zh-cn';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import * as serviceWorker from './serviceWorker';
import { history, updatePermissions } from 'libs';
import MessageHolder from 'libs/message';

moment.locale('zh-cn');
dayjs.extend(relativeTime);
dayjs.locale('zh-cn');
updatePermissions();

ReactDOM.render(
  <Router history={history}>
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#2563fc' } }} getPopupContainer={() => document.fullscreenElement || document.body}>
      <AntApp>
        <MessageHolder>
          <App/>
        </MessageHolder>
      </AntApp>
    </ConfigProvider>
  </Router>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
