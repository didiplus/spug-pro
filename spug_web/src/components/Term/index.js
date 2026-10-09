import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { FitAddon } from 'xterm-addon-fit';
import { Terminal } from 'xterm';

const Term = forwardRef(function Term(props, ref) {
  const el = useRef()
  const [term] = useState(() => new Terminal())
  const [fitPlugin] = useState(() => new FitAddon())

  useEffect(() => {
    term.options.disableStdin = true
    term.options.fontFamily = 'Source Code Pro, Courier New, Courier, Monaco, monospace, PingFang SC, Microsoft YaHei'
    term.options.fontSize = 13
    term.options.lineHeight = 1.5
    term.options.theme = {background: '#1a1b26', foreground: '#c0caf5', cursor: '#1a1b26'}
    term.attachCustomKeyEventHandler((arg) => {
      if (arg.ctrlKey && arg.code === 'KeyC' && arg.type === 'keydown') {
        document.execCommand('copy')
        return false
      }
      return true
    })
    term.loadAddon(fitPlugin)
    term.open(el.current)
    fitPlugin.fit()
    const resize = () => fitPlugin.fit()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useImperativeHandle(ref, () => ({
    write: (data) => term.write(data),
    clear: () => { term.clear(); term.reset() },
    fit: () => fitPlugin.fit(),
    scrollToBottom: () => term.scrollToBottom(),
    term: () => term,
  }))

  return <div ref={el} style={{height: '100%', width: '100%', overflow: 'hidden'}}/>
})

export default Term