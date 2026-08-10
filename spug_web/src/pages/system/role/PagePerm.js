/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright: (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import { observer } from 'mobx-react';
import { message } from 'libs/message';
import { Drawer, Alert, Tree, Button, Spin } from 'antd';
import http from 'libs/http';
import store from './store';
import {
  fetchMenuTree, buildTreeData, collectAllKeys, collectLeafPerms,
  countCheckedInNode, countTotalInNode,
  checkedKeysToPerms, permsToCheckedKeys,
} from './menuCodes';


@observer
class PagePerm extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      menusLoading: true,
      treeData: [],
      leafPerms: [],
      expandedKeys: [],
      checkedKeys: [],
    };
  }

  componentDidMount() {
    fetchMenuTree().then(menus => {
      const treeData = buildTreeData(menus);
      const leafPerms = collectLeafPerms(treeData);
      const allKeys = collectAllKeys(treeData);
      const checkedKeys = permsToCheckedKeys(store.permissions, leafPerms);
      this.setState({
        menusLoading: false,
        treeData,
        leafPerms,
        expandedKeys: allKeys,
        checkedKeys,
      });
    });
  }

  handleCheck = (checkedKeys) => {
    this.setState({ checkedKeys });
  };

  handleExpand = (expandedKeys) => {
    this.setState({ expandedKeys });
  };

  handleSelectAll = () => {
    const allLeafKeys = this.state.leafPerms.map(l => l.key);
    this.setState({ checkedKeys: allLeafKeys });
  };

  handleClearAll = () => {
    this.setState({ checkedKeys: [] });
  };

  handleClose = () => {
    store.pagePermVisible = false;
  };

  handleSubmit = () => {
    const perms = checkedKeysToPerms(this.state.checkedKeys, this.state.leafPerms);
    this.setState({ loading: true });
    http.patch('/api/account/role/', { id: store.record.id, page_perms: perms })
      .then(() => {
        message.success('操作成功');
        store.pagePermVisible = false;
        store.fetchRecords();
        this.setState({ loading: false });
      }, () => this.setState({ loading: false }));
  };

  renderTitle = (node) => {
    const checkedSet = new Set(this.state.checkedKeys);
    const total = countTotalInNode(node);
    const checked = countCheckedInNode(node, checkedSet);

    if (node.children && node.children.length > 0) {
      const isTopLevel = !node.key.includes('_default') && this.state.treeData.some(n => n.key === node.key);
      return (
        <span>
          <span style={{ fontWeight: isTopLevel ? 600 : 400 }}>{node.title}</span>
          {total > 0 && (
            <span style={{ marginLeft: 8, color: '#999', fontSize: '12px' }}>
              ({checked}/{total})
            </span>
          )}
        </span>
      );
    }

    return node.title;
  };

  processTreeData = (treeData) => {
    return treeData.map(node => {
      const newNode = {
        ...node,
        title: this.renderTitle(node),
      };
      if (node.children) {
        newNode.children = this.processTreeData(node.children);
      }
      return newNode;
    });
  };

  render() {
    const { menusLoading, treeData, expandedKeys, checkedKeys, loading } = this.state;

    if (menusLoading) {
      return (
        <Drawer
          open={store.pagePermVisible}
          width={450}
          closable={true}
          title="功能权限设置"
          placement="right"
          onClose={this.handleClose}
        >
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin tip="加载权限数据..." />
          </div>
        </Drawer>
      );
    }

    const processedTreeData = this.processTreeData(treeData);

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
            <Button onClick={this.handleSelectAll} style={{ marginRight: 8 }}>全选</Button>
            <Button onClick={this.handleClearAll} style={{ marginRight: 8 }}>清空</Button>
            <Button onClick={this.handleClose} style={{ marginRight: 8 }}>取消</Button>
            <Button type="primary" loading={loading} onClick={this.handleSubmit}>保存</Button>
          </div>
        }
      >
        <Alert
          closable
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message="功能权限仅影响页面功能，管理应用的发布权限请在发布权限中设置。权限更改成功后会强制属于该角色的账户重新登录。"
        />
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
