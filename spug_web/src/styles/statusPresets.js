/**
 * 共享状态配色预设 — 基于 design-system 令牌体系
 * CSS var 引用用于 DOM inline style，hex 值用于 SVG/Canvas/Chart
 */

const VAR = (name) => `var(${name})`;

export const STATUS_PRESETS = {
  success: {
    label: '正常',
    color: VAR('--color-green-600'),
    bg: 'rgba(82, 196, 26, 0.1)',
    border: 'rgba(82, 196, 26, 0.3)',
    hex: '#52c41a',
  },
  warning: {
    label: '警告',
    color: VAR('--color-gold-500'),
    bg: 'rgba(250, 173, 20, 0.1)',
    border: 'rgba(250, 173, 20, 0.3)',
    hex: '#faad14',
  },
  error: {
    label: '紧急',
    color: VAR('--color-red-600'),
    bg: 'rgba(255, 77, 79, 0.1)',
    border: 'rgba(255, 77, 79, 0.3)',
    hex: '#ff4d4f',
  },
  inactive: {
    label: '未激活',
    color: VAR('--color-text-secondary'),
    bg: VAR('--color-gray-100'),
    border: VAR('--color-border'),
    hex: '#8c8c8c',
  },
  pending: {
    label: '待调度',
    color: VAR('--color-primary'),
    bg: VAR('--color-blue-50'),
    border: VAR('--color-blue-200'),
    hex: '#1677ff',
  },
};

export const MONITOR_STATUS_MAP = {
  '1': STATUS_PRESETS.success,
  '2': STATUS_PRESETS.warning,
  '3': STATUS_PRESETS.error,
  '0': STATUS_PRESETS.inactive,
  '10': STATUS_PRESETS.pending,
};

export const DB_ROLE_CONFIG = {
  master:     { label: '主库', color: VAR('--color-primary'),       bg: VAR('--color-blue-50'),  border: VAR('--color-blue-200') },
  slave:      { label: '从库', color: VAR('--color-green-600'),     bg: 'rgba(82, 196, 26, 0.1)', border: 'rgba(82, 196, 26, 0.3)' },
  replica:    { label: '副本', color: VAR('--color-green-600'),     bg: 'rgba(82, 196, 26, 0.1)', border: 'rgba(82, 196, 26, 0.3)' },
  standalone: { label: '独立', color: VAR('--color-text-secondary'), bg: VAR('--color-gray-50'),  border: VAR('--color-border') },
};

export const DB_ROLE_HEX = {
  master:     '#1677ff',
  slave:      '#52c41a',
  replica:    '#52c41a',
  standalone: '#8c8c8c',
};

export const EDGE_STATUS_CONFIG = {
  running: { color: VAR('--color-green-600'), hex: '#52c41a', label: '正常' },
  stopped: { color: VAR('--color-red-600'),   hex: '#ff4d4f', label: '停止' },
  error:   { color: VAR('--color-red-600'),   hex: '#ff4d4f', label: '错误' },
  unknown: { color: VAR('--color-gray-400'),  hex: '#d9d9d9', label: '未知' },
};

export const DB_TYPE_HEX = {
  mysql:         '#1677ff',
  mariadb:       '#00b5d8',
  postgresql:    '#722ed1',
  tidb:          '#2f54eb',
  redis:         '#eb2f96',
  mongodb:       '#13c2c2',
  mssql:         '#fa8c16',
  oracle:        '#cf1322',
  sqlite:        '#52c41a',
  clickhouse:    '#d48806',
  elasticsearch: '#d4380d',
  cassandra:     '#7cb305',
};