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

// 方法别名映射，用于处理版本差异
const METHOD_ALIASES = {
  close: ['close', 'destroy'], // 优先 close，若不存在则尝试 destroy
};

function safeGet(instance, method, fallbackInstance) {
  // 检查原始方法
  let fn = instance?.[method];
  if (typeof fn === 'function') {
    return fn;
  }
  // 检查 fallback
  fn = fallbackInstance?.[method];
  if (typeof fn === 'function') {
    return fn;
  }
  // 尝试别名
  const aliases = METHOD_ALIASES[method];
  if (aliases) {
    for (const alias of aliases) {
      if (alias !== method) {
        fn = instance?.[alias];
        if (typeof fn === 'function') return fn;
        fn = fallbackInstance?.[alias];
        if (typeof fn === 'function') return fn;
      }
    }
  }
  // 完全不可用，返回空函数并警告
  console.warn(`[message/notification] ${method} is not available, using noop`);
  return () => {};
}

export const message = new Proxy({}, {
  get(_, method) {
    return (...args) => {
      const instance = getMessage();
      const staticInstance = require('antd').message;
      const fn = safeGet(instance, method, staticInstance);
      return fn(...args);
    };
  }
});

export const notification = new Proxy({}, {
  get(_, method) {
    return (...args) => {
      const instance = getNotification();
      const staticInstance = require('antd').notification;
      const fn = safeGet(instance, method, staticInstance);
      return fn(...args);
    };
  }
});

export default function MessageHolder({ children }) {
  const { message, notification } = App.useApp();
  React.useEffect(() => {
    _message = message;
    _notification = notification;
  }, [message, notification]);
  return children;
}