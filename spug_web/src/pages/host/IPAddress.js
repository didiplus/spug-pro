/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';

function IPAddress(props) {
  const pubStyle = {
    background: 'rgba(250, 173, 20, 0.12)',
    borderRadius: 4,
    color: 'var(--color-gold-500)',
    fontSize: 10,
    marginRight: 4,
    padding: '0 8px',
    fontWeight: 500,
  }

  const priStyle = {
    background: 'rgba(22, 119, 255, 0.08)',
    borderRadius: 4,
    color: 'var(--color-primary)',
    fontSize: 10,
    marginRight: 4,
    padding: '0 8px',
    fontWeight: 500,
  }

  return (props.ip && props.ip.length > 0) ? (
    <div style={{width: 150, display: 'flex', alignItems: 'center'}}>
      {props.isPublic ? <span style={pubStyle}>公</span> : <span style={priStyle}>内</span>}
      <span style={{color: 'var(--color-text)'}}>{props.ip[0]}</span>
    </div>
  ) : null
}

export default IPAddress
