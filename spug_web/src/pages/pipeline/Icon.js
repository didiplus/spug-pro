import React from 'react';
import { Avatar } from 'antd';
import {
  CodeOutlined, BuildOutlined, SettingOutlined, SwapOutlined,
  BellOutlined, MessageOutlined,
} from '@ant-design/icons';

const ICON_MAP = {
  ssh_exec: { icon: <CodeOutlined />, color: '#1890ff' },
  build: { icon: <BuildOutlined />, color: '#52c41a' },
  parameter: { icon: <SettingOutlined />, color: '#722ed1' },
  data_transfer: { icon: <SwapOutlined />, color: '#fa8c16' },
  push_dd: { icon: <MessageOutlined />, color: '#1890ff' },
  push_fs: { icon: <MessageOutlined />, color: '#13c2c2' },
  push_wx: { icon: <MessageOutlined />, color: '#52c41a' },
  push_spug: { icon: <BellOutlined />, color: '#fa541c' },
};

function Icon(props) {
  const conf = ICON_MAP[props.module];
  if (!conf) {
    return <Avatar size={props.size || 42} style={{ backgroundColor: '#999' }}><SettingOutlined /></Avatar>;
  }
  return (
    <Avatar size={props.size || 42} style={{ backgroundColor: conf.color }}>
      {conf.icon}
    </Avatar>
  );
}

export default Icon