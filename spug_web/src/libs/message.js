import React from 'react';
import { App } from 'antd';

let _message = null;
let _notification = null;

export function getMessage() {
  return _message || require('antd').message;
}

export function getNotification() {
  return _notification || require('antd').notification;
}

export const message = new Proxy({}, {
  get(_, method) {
    return (...args) => getMessage()[method](...args);
  }
});

export const notification = new Proxy({}, {
  get(_, method) {
    return (...args) => getNotification()[method](...args);
  }
});

export default function MessageHolder({children}) {
  const {message, notification} = App.useApp();
  React.useEffect(() => {
    _message = message;
    _notification = notification;
  }, [message, notification]);
  return children;
}