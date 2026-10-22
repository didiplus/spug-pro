import React, { useState, useEffect } from 'react';
import { ConfigProvider, App as AntApp } from 'antd';
import { theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { getTheme, initTheme } from 'libs/theme';

initTheme();

export default function ThemeProvider({ children }) {
  const [currentTheme, setCurrentTheme] = useState(getTheme());

  useEffect(() => {
    const handler = (e) => setCurrentTheme(e.detail || getTheme());
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
  }, []);

  const isDark = currentTheme === 'dark';

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#2563fc',
          colorBgBase: isDark ? '#141414' : '#ffffff',
        },
      }}
      getPopupContainer={() => document.fullscreenElement || document.body}
    >
      <AntApp>
        {children}
      </AntApp>
    </ConfigProvider>
  );
}