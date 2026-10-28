import React, { useState, useEffect } from 'react';
import Editor from 'react-ace';
import 'ace-builds/src-noconflict/mode-sh';
import 'ace-builds/src-noconflict/mode-text';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/mode-space';
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/theme-tomorrow';
import 'ace-builds/src-noconflict/theme-tomorrow_night';
import 'ace-builds/src-noconflict/ext-language_tools';
import 'ace-builds/src-noconflict/snippets/sh';
import 'ace-builds/src-noconflict/snippets/text';
import 'ace-builds/src-noconflict/snippets/json';
import 'ace-builds/src-noconflict/snippets/python';
import 'ace-builds/src-noconflict/snippets/sql';
import { getTheme } from 'libs/theme';

export default function (props) {
  const [isDark, setIsDark] = useState(getTheme() === 'dark');
  useEffect(() => {
    const handler = () => setIsDark(getTheme() === 'dark');
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
  }, []);
  const style = {fontFamily: 'Source Code Pro, Courier New, Courier, Monaco, monospace, PingFang SC, Microsoft YaHei', ...props.style}
  return (
    <Editor
      theme={isDark ? 'tomorrow_night' : 'tomorrow'}
      fontSize={13}
      tabSize={2}
      {...props}
      style={style}
      setOptions={{
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        enableSnippets: true,
      }}
    />
  )
}