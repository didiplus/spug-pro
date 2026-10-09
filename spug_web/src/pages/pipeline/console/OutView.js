import React, { useEffect, useRef } from 'react';
import { FitAddon } from 'xterm-addon-fit';
import { Terminal } from 'xterm';

function OutView(props) {
  const el = useRef()

  useEffect(() => {
    setTimeout(() => {
      const fitPlugin = new FitAddon()
      const term = new Terminal({disableStdin: true})
      term.setOption('fontFamily', 'Source Code Pro, Courier New, Courier, Monaco, monospace, PingFang SC, Microsoft YaHei')
      term.loadAddon(fitPlugin)
      term.setOption('theme', {background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#1e1e1e'})
      term.attachCustomKeyEventHandler((arg) => {
        if (arg.ctrlKey && arg.code === 'KeyC' && arg.type === 'keydown') {
          document.execCommand('copy')
          return false
        }
        return true
      })
      term.open(el.current)
      fitPlugin.fit()
      props.setTerm(term)
    }, 100)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{padding: '8px 0 0 15px'}}>
      <div ref={el} style={{height: 300}}/>
    </div>
  )
}

export default OutView