/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
export default [{
  key: 'dashboard',
  label: 'Dashboard',
  pages: [{
    key: 'dashboard',
    label: 'Dashboard',
    perms: [
      {key: 'view', label: '查看Dashboard'}
    ]
  }]
}, {
  key: 'host',
  label: '主机管理',
  pages: [{
    key: 'host',
    label: '主机管理',
    perms: [
      {key: 'view', label: '查看主机'},
      {key: 'add', label: '新建主机'},
      {key: 'edit', label: '编辑主机'},
      {key: 'del', label: '删除主机'},
    ]
  }, {
    key: 'console',
    label: 'Web终端',
    perms: [
      {key: 'view', label: 'Web终端'},
      {key: 'list', label: '文件管理'},
      {key: 'upload', label: '上传文件'},
      {key: 'del', label: '删除文件'},
    ]
  }]
}, {
  key: 'exec',
  label: '批量执行',
  pages: [{
    key: 'task',
    label: '执行任务',
    perms: [
      {key: 'do', label: '执行任务'}
    ]
  }, {
    key: 'template',
    label: '模板管理',
    perms: [
      {key: 'view', label: '查看模板'},
      {key: 'add', label: '新建模板'},
      {key: 'edit', label: '编辑模板'},
      {key: 'del', label: '删除模板'},
    ]
  }, {
    key: 'transfer',
    label: '文件分发',
    perms: [
      {key: 'do', label: '文件分发'}
    ]
  }]
}, {
  key: 'deploy',
  label: '应用发布',
  pages: [{
    key: 'app',
    label: '应用管理',
    perms: [
      {key: 'view', label: '查看应用'},
      {key: 'add', label: '新建应用'},
      {key: 'edit', label: '编辑应用'},
      {key: 'del', label: '删除应用'},
      {key: 'config', label: '查看配置'},
    ]
  }, {
    key: 'repository',
    label: '构建仓库',
    perms: [
      {key: 'view', label: '查看构建'},
      {key: 'add', label: '新建版本'},
      {key: 'build', label: '执行构建'},
      {key: 'del', label: '删除版本'},
    ]
  },{
    key: 'request',
    label: '发布申请',
    perms: [
      {key: 'view', label: '查看申请'},
      {key: 'add', label: '新建申请'},
      {key: 'edit', label: '编辑申请'},
      {key: 'del', label: '删除申请'},
      {key: 'approve', label: '审核申请'},
      {key: 'do', label: '执行发布'}
    ]
  }]
}, {
  key: 'schedule',
  label: '任务计划',
  pages: [{
    key: 'schedule',
    label: '任务计划',
    perms: [
      {key: 'view', label: '查看任务'},
      {key: 'add', label: '新建任务'},
      {key: 'edit', label: '编辑任务'},
      {key: 'del', label: '删除任务'},
    ]
  }]
}, {
  key: 'config',
  label: '配置中心',
  pages: [{
    key: 'env',
    label: '环境管理',
    perms: [
      {key: 'view', label: '查看环境'},
      // {key: 'add', label: '新建环境'},
      {key: 'edit', label: '编辑环境'},
      {key: 'del', label: '删除环境'}
    ]
  }, {
    key: 'src',
    label: '服务管理',
    perms: [
      {key: 'view', label: '查看服务'},
      {key: 'add', label: '新建服务'},
      {key: 'edit', label: '编辑服务'},
      {key: 'del', label: '删除服务'},
      {key: 'view_config', label: '查看配置'},
      {key: 'edit_config', label: '修改配置'},
    ]
  }, {
    key: 'app',
    label: '应用管理',
    perms: [
      {key: 'view', label: '查看应用'},
      // {key: 'add', label: '新建应用'},
      {key: 'edit', label: '编辑应用'},
      {key: 'del', label: '删除应用'},
      {key: 'view_config', label: '查看配置'},
      {key: 'edit_config', label: '修改配置'},
    ]
  }]
}, {
  key: 'monitor',
  label: '监控中心',
  pages: [{
    key: 'monitor',
    label: '监控中心',
    perms: [
      {key: 'view', label: '查看监控'},
      {key: 'add', label: '新建监控'},
      {key: 'edit', label: '编辑监控'},
      {key: 'del', label: '删除监控'},
    ]
  }]
}, {
  key: 'alarm',
  label: '报警中心',
  pages: [{
    key: 'alarm',
    label: '报警记录',
    perms: [
      {key: 'view', label: '查看记录'}
    ]
  }, {
    key: 'contact',
    label: '报警联系人',
    perms: [
      {key: 'view', label: '查看联系人'},
      {key: 'add', label: '新建联系人'},
      {key: 'edit', label: '编辑联系人'},
      {key: 'del', label: '删除联系人'},
    ]
  }, {
    key: 'group',
    label: '报警联系组',
    perms: [
      {key: 'view', label: '查看联系组'},
      {key: 'add', label: '新建联系组'},
      {key: 'edit', label: '编辑联系组'},
      {key: 'del', label: '删除联系组'},
    ]
  }]
}, {
  key: 'database',
  label: '数据库管理',
  pages: [{
    key: 'instance',
    label: '数据库实例',
    perms: [
      {key: 'view', label: '查看实例'},
      {key: 'add', label: '新建实例'},
      {key: 'edit', label: '编辑实例'},
      {key: 'del', label: '删除实例'},
      {key: 'execute', label: '执行SQL'},
    ]
  }]
}, {
  key: 'playbook',
  label: 'Playbook 管理',
  pages: [{
    key: 'playbook',
    label: 'Playbook',
    perms: [
      {key: 'view', label: '查看 Playbook'},
      {key: 'add', label: '新建 Playbook'},
      {key: 'edit', label: '编辑 Playbook'},
      {key: 'del', label: '删除 Playbook'},
      {key: 'run', label: '执行 Playbook'},
    ]
  }]
}, {
  key: 'ansible',
  label: 'Ansible 管理',
  pages: [{
    key: 'inventory',
    label: 'Inventory 管理',
    perms: [
      {key: 'view', label: '查看 Inventory'},
      {key: 'edit', label: '编辑 Inventory'},
    ]
  }, {
    key: 'vault',
    label: 'Vault 管理',
    perms: [
      {key: 'view', label: '查看 Vault'},
      {key: 'edit', label: '编辑 Vault'},
    ]
  }, {
    key: 'facts',
    label: 'Facts 浏览',
    perms: [
      {key: 'view', label: '查看 Facts'},
      {key: 'collect', label: '采集 Facts'},
    ]
  }, {
    key: 'role',
    label: 'Role 管理',
    perms: [
      {key: 'view', label: '查看 Role'},
      {key: 'edit', label: '管理 Role'},
    ]
  }]
}, {
  key: 'system',
  label: '系统管理',
  pages: [{
    key: 'account',
    label: '账户管理',
    perms: [
      {key: 'view', label: '查看账户'},
      {key: 'add', label: '新建账户'},
      {key: 'edit', label: '编辑账户'},
      {key: 'del', label: '删除账户'},
    ]
  }, {
    key: 'role',
    label: '角色管理',
    perms: [
      {key: 'view', label: '查看角色'},
      {key: 'add', label: '新建角色'},
      {key: 'edit', label: '编辑角色'},
      {key: 'del', label: '删除角色'},
    ]
  }, {
    key: 'setting',
    label: '系统设置',
    perms: [
      {key: 'view', label: '查看设置'},
      {key: 'edit', label: '编辑设置'},
    ]
  }, {
    key: 'login',
    label: '登录日志',
    perms: [
      {key: 'view', label: '查看日志'},
    ]
  }, {
    key: 'menu',
    label: '菜单管理',
    perms: [
      {key: 'view', label: '查看菜单'},
      {key: 'add', label: '新建菜单'},
      {key: 'edit', label: '编辑菜单'},
      {key: 'del', label: '删除菜单'},
    ]
  }]
}]
