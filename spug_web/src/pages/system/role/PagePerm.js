/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import {  } from 'antd';
import { Drawer, Alert, Tree, Button } from 'antd';
import http from 'libs/http';
import store from './store';
import codes from './codes';


@observer
class PagePerm extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      expandedKeys: [],
      checkedKeys: [],
    };
  }

  componentDidMount() {
    // 初始化展开所有节点
    const allKeys = this.getAllKeys();
    this.setState({ expandedKeys: allKeys });
    // 初始化选中状态
    const checkedKeys = this.getCheckedKeys();
    this.setState({ checkedKeys });
  }

  // 获取所有节点key
  getAllKeys = () => {
    const keys = [];
    codes.forEach(mod => {
      keys.push(mod.key);
      mod.pages.forEach(page => {
        keys.push(`${mod.key}.${page.key}`);
        page.perms.forEach(perm => {
          keys.push(`${mod.key}.${page.key}.${perm.key}`);
        });
      });
    });
    return keys;
  };

  // 获取当前选中的key列表
  getCheckedKeys = () => {
    const keys = [];
    codes.forEach(mod => {
      const modPermissions = store.permissions[mod.key] || {};
      mod.pages.forEach(page => {
        const pagePermissions = modPermissions[page.key] || [];
        // 如果页面所有权限都被选中，只选中页面节点
        const allPerms = page.perms.map(p => p.key);
        if (pagePermissions.length === allPerms.length && allPerms.length > 0) {
          keys.push(`${mod.key}.${page.key}`);
        } else {
          // 否则选中具体的权限
          pagePermissions.forEach(perm => {
            keys.push(`${mod.key}.${page.key}.${perm}`);
          });
        }
      });
    });
    return keys;
  };

  // 更新权限数据
  updatePermissions = (checkedKeys) => {
    const permissions = {};
    codes.forEach(mod => {
      permissions[mod.key] = {};
      mod.pages.forEach(page => {
        permissions[mod.key][page.key] = [];
      });
    });

    checkedKeys.forEach(key => {
      const parts = key.split('.');
      if (parts.length === 3) {
        // 权限节点
        const [mod, page, perm] = parts;
        if (permissions[mod] && permissions[mod][page]) {
          permissions[mod][page].push(perm);
        }
      } else if (parts.length === 2) {
        // 页面节点 - 选中该页面所有权限
        const [mod, page] = parts;
        const pageData = codes.find(m => m.key === mod)?.pages.find(p => p.key === page);
        if (pageData) {
          permissions[mod][page] = pageData.perms.map(p => p.key);
        }
      } else if (parts.length === 1) {
        // 模块节点 - 选中该模块所有权限
        const mod = parts[0];
        const modData = codes.find(m => m.key === mod);
        if (modData) {
          modData.pages.forEach(page => {
            permissions[mod][page.key] = page.perms.map(p => p.key);
          });
        }
      }
    });

    store.permissions = permissions;
  };

  handleCheck = (checkedKeys) => {
    this.setState({ checkedKeys: checkedKeys });
    this.updatePermissions(checkedKeys);
  };

  handleExpand = (expandedKeys) => {
    this.setState({ expandedKeys });
  };

  // 全选所有权限
  handleSelectAll = () => {
    //const allKeys = this.getAllKeys();
    // 只选择叶子节点（权限节点），避免父节点重复选中
    const leafKeys = [];
    codes.forEach(mod => {
      mod.pages.forEach(page => {
        page.perms.forEach(perm => {
          leafKeys.push(`${mod.key}.${page.key}.${perm.key}`);
        });
      });
    });
    this.setState({ checkedKeys: leafKeys });
    this.updatePermissions(leafKeys);
  };

  // 清空所有权限
  handleClearAll = () => {
    this.setState({ checkedKeys: [] });
    const emptyPermissions = {};
    codes.forEach(mod => {
      emptyPermissions[mod.key] = {};
      mod.pages.forEach(page => {
        emptyPermissions[mod.key][page.key] = [];
      });
    });
    store.permissions = emptyPermissions;
  };

  // 关闭抽屉
  handleClose = () => {
    store.pagePermVisible = false;
    // 重置为初始状态
    const checkedKeys = this.getCheckedKeys();
    this.setState({ checkedKeys });
  };

  handleSubmit = () => {
    this.setState({ loading: true });
    http.patch('/api/account/role/', { id: store.record.id, page_perms: store.permissions })
      .then(res => {
        message.success('操作成功');
        store.pagePermVisible = false;
        store.fetchRecords();
        this.setState({ loading: false });
      }, () => this.setState({ loading: false }));
  };

  // 构建树形数据
  buildTreeData = () => {
    return codes.map(mod => {
      const modKey = mod.key;
      const children = mod.pages.map(page => {
        const pageKey = `${modKey}.${page.key}`;
        const permChildren = page.perms.map(perm => ({
          key: `${pageKey}.${perm.key}`,
          title: perm.label,
          selectable: true,
          isLeaf: true,
        }));

        return {
          key: pageKey,
          title: page.label,
          selectable: true,
          children: permChildren,
        };
      });

      return {
        key: modKey,
        title: mod.label,
        selectable: true,
        children: children,
      };
    });
  };

  // 自定义节点渲染
  renderTitle = (node) => {
    const key = node.key;
    const parts = key.split('.');
    const isModule = parts.length === 1;
    const isPage = parts.length === 2;
    const isPerm = parts.length === 3;

    if (isPerm) {
      return node.title;
    }

    if (isPage) {
      const [mod, page] = parts;
      const pageData = codes.find(m => m.key === mod)?.pages.find(p => p.key === page);
      const allPerms = pageData?.perms.map(p => p.key) || [];
      const checkedPerms = store.permissions[mod]?.[page] || [];
      const checkedCount = checkedPerms.length;
      const totalCount = allPerms.length;

      return (
        <span>
          {node.title}
          {totalCount > 0 && (
            <span style={{ marginLeft: 8, color: '#999', fontSize: '12px' }}>
              ({checkedCount}/{totalCount})
            </span>
          )}
        </span>
      );
    }

    if (isModule) {
      // 计算模块下所有权限总数和已选数量
      const modData = codes.find(m => m.key === key);
      let totalPerms = 0;
      let checkedPerms = 0;
      if (modData) {
        modData.pages.forEach(page => {
          const perms = page.perms.map(p => p.key);
          totalPerms += perms.length;
          const checked = store.permissions[key]?.[page.key] || [];
          checkedPerms += checked.length;
        });
      }
      return (
        <span>
          <span style={{ fontWeight: 600 }}>{node.title}</span>
          <span style={{ marginLeft: 8, color: '#999', fontSize: '12px' }}>
            ({checkedPerms}/{totalPerms})
          </span>
        </span>
      );
    }

    return node.title;
  };

  render() {
    const treeData = this.buildTreeData();
    const { expandedKeys, checkedKeys, loading } = this.state;

    // 处理树节点数据，添加自定义标题
    const processedTreeData = treeData.map(node => {
      const processNode = (n) => {
        const newNode = {
          ...n,
          title: this.renderTitle(n),
        };
        if (n.children) {
          newNode.children = n.children.map(child => processNode(child));
        }
        return newNode;
      };
      return processNode(node);
    });

    return (
      <Drawer
        open={store.pagePermVisible}
        width={450}
        closable={true}
        title="功能权限设置"
        placement="right"
        onClose={this.handleClose}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Button onClick={this.handleSelectAll}  style={{ marginRight: 8 }} >全选</Button>
            <Button onClick={this.handleClearAll}  style={{ marginRight: 8 }} >清空</Button>
            <Button onClick={this.handleClose} style={{ marginRight: 8 }}>
              取消
            </Button>
            <Button type="primary" loading={loading} onClick={this.handleSubmit}>
              保存
            </Button>
          </div>
        }
      >
        { <Alert
          closable
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message="功能权限仅影响页面功能，管理应用的发布权限请在发布权限中设置。权限更改成功后会强制属于该角色的账户重新登录。"
        /> }

  
          <Tree
            checkable
            checkStrictly={false}
            expandedKeys={expandedKeys}
            checkedKeys={checkedKeys}
            onCheck={this.handleCheck}
            onExpand={this.handleExpand}
            treeData={processedTreeData}
            showLine={{ showLeafIcon: false }}
            style={{
              maxHeight: 'calc(100vh - 300px)',
              minHeight: '400px',
              overflowY: 'auto',
              padding: '8px 16px'
            }}
          />
      </Drawer>
    );
  }
}

export default PagePerm;