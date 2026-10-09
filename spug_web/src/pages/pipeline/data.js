import { t } from 'libs';

export const NODES = [
  {module: 'ssh_exec', name: t('执行命令'), category: 'exec'},
  {module: 'build', name: t('构建'), category: 'exec'},
  {module: 'parameter', name: t('参数化'), category: 'exec'},
  {module: 'data_transfer', name: t('数据传输'), category: 'data'},

  {module: 'push_dd', name: t('钉钉推送'), category: 'notify'},
  {module: 'push_fs', name: t('飞书推送'), category: 'notify'},
  {module: 'push_wx', name: t('企业微信推送'), category: 'notify'},
  {module: 'push_spug', name: t('推送助手'), category: 'notify'},
];

export const CATEGORIES = [
  {key: 'exec', label: t('执行类')},
  {key: 'data', label: t('数据类')},
  {key: 'notify', label: t('通知类')},
];
