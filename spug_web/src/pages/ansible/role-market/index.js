import React from 'react';
import { observer } from 'mobx-react';
import { Modal, Input, Select, Drawer, Tag, Space, Tooltip, Button, Typography, Spin, Empty, Card, Row, Col, Descriptions, Table, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined, SyncOutlined, ThunderboltOutlined, HistoryOutlined, GithubOutlined, AppstoreOutlined, CodeOutlined, ClusterOutlined, BranchesOutlined, FileTextOutlined, WarningOutlined, TagOutlined } from '@ant-design/icons';
import { hasPermission } from 'libs';
import { AuthDiv, Breadcrumb, AuthButton, SearchForm } from 'components';
import AddSourceForm from './AddSourceForm';
import DeployForm from './DeployForm';
import Output from './Output';
import store from './store';
import styles from './role-market.module.css';

const { Text, Paragraph } = Typography;

const INSTALL_STATUS_MAP = {
  pending: { cls: styles.statusInactive, text: '待安装', color: 'default' },
  installing: { cls: styles.statusRunning, text: '安装中', color: 'processing' },
  installed: { cls: styles.statusSuccess, text: '已安装', color: 'success' },
  failed: { cls: styles.statusFailed, text: '安装失败', color: 'error' },
};

const DEPLOY_STATUS_MAP = {
  pending: { cls: styles.statusInactive, text: '待执行' },
  running: { cls: styles.statusRunning, text: '执行中', dot: true },
  success: { cls: styles.statusSuccess, text: '成功' },
  failed: { cls: styles.statusFailed, text: '失败' },
};

@observer
class RoleMarketIndex extends React.Component {
  componentDidMount() {
    store.fetchRecords();
  }

  handleDelete = (record) => {
    Modal.confirm({
      title: '删除确认',
      content: `确定要删除 Role 源【${record.name}】？本地缓存将一并清理。`,
      onOk: () => store.deleteRole(record.id)
    })
  };

  renderInstallStatus = (status) => {
    const cfg = INSTALL_STATUS_MAP[status] || INSTALL_STATUS_MAP.pending;
    return <Tag color={cfg.color} style={{margin: 0}}>{cfg.text}</Tag>;
  };

  renderDeployStatus = (status) => {
    const cfg = DEPLOY_STATUS_MAP[status] || DEPLOY_STATUS_MAP.pending;
    return (
      <span className={`${styles.statusTag} ${cfg.cls}`}>
        {cfg.dot && <span className={styles.statusDot} style={{background: 'currentColor'}}/>}
        {cfg.text}
      </span>
    );
  };

  renderCategories = (categories) => {
    if (!categories) return null;
    const list = categories.split(',').filter(Boolean);
    return (
      <Space size={4} wrap>
        {list.map(c => <Tag key={c} className={styles.categoryTag}>{c.trim()}</Tag>)}
      </Space>
    );
  };

  renderCard = (record) => {
    const canDeploy = record.install_status === 'installed' && hasPermission('ansible.role.run');
    const canEdit = hasPermission('ansible.role.edit');
    return (
      <Col key={record.id} xs={24} sm={12} md={8} lg={6}>
        <Card
          className={styles.roleCard}
          hoverable
          onClick={() => store.fetchDetail(record.id)}
          actions={[
            canDeploy && (
              <Tooltip title="一键部署" key="deploy">
                <ThunderboltOutlined onClick={(e) => {e.stopPropagation(); store.showDeploy(record)}}/>
              </Tooltip>
            ),
            record.install_status === 'installing' && canEdit && (
              <Tooltip title="安装中..." key="installing">
                <SyncOutlined spin onClick={(e) => e.stopPropagation()}/>
              </Tooltip>
            ),
            record.install_status === 'installed' && canEdit && (
              <Tooltip title="更新" key="update">
                <SyncOutlined spin={store.installingId === record.id} onClick={(e) => {e.stopPropagation(); store.installRole(record.id)}}/>
              </Tooltip>
            ),
            canEdit && (
              <Tooltip title="删除" key="delete">
                <DeleteOutlined onClick={(e) => {e.stopPropagation(); this.handleDelete(record)}}/>
              </Tooltip>
            ),
          ].filter(Boolean)}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <AppstoreOutlined className={styles.cardIcon}/>
              <Text strong ellipsis style={{flex: 1}}>{record.name}</Text>
            </div>
            {this.renderInstallStatus(record.install_status)}
          </div>
          <Paragraph
            className={styles.cardDesc}
            ellipsis={{rows: 2}}
            type="secondary">
            {record.description || record.source_url}
          </Paragraph>
          <div className={styles.cardFooter}>
            {record.author && (
              <Space size={4}>
                <GithubOutlined style={{fontSize: 12, color: 'var(--color-text-tertiary)'}}/>
                <Text type="secondary" style={{fontSize: 12}}>{record.author}</Text>
              </Space>
            )}
            {this.renderCategories(record.categories)}
          </div>
        </Card>
      </Col>
    );
  };

  renderDetail = () => {
    if (store.detailFetching) return <div className={styles.detailLoading}><Spin/></div>;
    const d = store.detail;
    if (!d) return <Empty description="暂无数据"/>;

    const metaItems = [];
    if (d.author) metaItems.push({label: '作者', value: d.author});
    if (d.namespace) metaItems.push({label: '命名空间', value: <Text code>{d.namespace}</Text>});
    if (d.branch && d.source_type !== 'local') metaItems.push({label: '分支', value: <Text code>{d.branch}</Text>});
    if (d.min_ansible_version) metaItems.push({label: '最低 Ansible 版本', value: d.min_ansible_version});
    if (d.installed_commit) metaItems.push({label: 'Commit', value: <Text code style={{fontSize: 12}}>{d.installed_commit.slice(0, 8)}</Text>});
    if (d.source_url && d.source_type !== 'local') metaItems.push({label: '源地址', value: <Text code ellipsis style={{maxWidth: 280}}>{d.source_url}</Text>});
    if (d.local_path) metaItems.push({label: '本地路径', value: <Text code ellipsis style={{maxWidth: 280}}>{d.local_path}</Text>});

    return (
      <div className={styles.detailContent}>
        <div className={styles.detailHero}>
          <div className={styles.detailHeroTop}>
            <Space align="center">
              <AppstoreOutlined className={styles.detailHeroIcon}/>
              <Text strong style={{fontSize: 18}}>{d.name}</Text>
            </Space>
            {this.renderInstallStatus(d.install_status)}
          </div>
          {d.description && <Paragraph type="secondary" style={{margin: 0, marginTop: 8}}>{d.description}</Paragraph>}
        </div>

        {metaItems.length > 0 && (
          <Descriptions
            column={2}
            colon={false}
            size="small"
            className={styles.detailMeta}
            labelStyle={{color: 'var(--color-text-secondary)', fontSize: 12, width: 100}}
            contentStyle={{fontSize: 13}}>
            {metaItems.map((item, i) => (
              <Descriptions.Item key={i} label={item.label}>{item.value}</Descriptions.Item>
            ))}
          </Descriptions>
        )}

        {d.categories && (
          <div className={styles.detailSection}>
            <div className={styles.sectionHeader}><TagOutlined/> 分类标签</div>
            {this.renderCategories(d.categories)}
          </div>
        )}

        {d.platforms?.length > 0 && (
          <div className={styles.detailSection}>
            <div className={styles.sectionHeader}><ClusterOutlined/> 支持平台</div>
            <Space size={6} wrap>
              {d.platforms.map((p, i) => (
                <Tag key={i} color="blue" className={styles.platformTag}>
                  {p.os} {Array.isArray(p.versions) && p.versions.length > 0 ? p.versions.join('/') : ''}
                </Tag>
              ))}
            </Space>
          </div>
        )}

        {d.dependencies?.length > 0 && (
          <div className={styles.detailSection}>
            <div className={styles.sectionHeader}><BranchesOutlined/> 依赖 Role</div>
            <Space size={6} wrap>
              {d.dependencies.map((dep, i) => (
                <Tag key={i} color="orange">{dep.name || JSON.stringify(dep)}</Tag>
              ))}
            </Space>
          </div>
        )}

        {d.variables_schema?.length > 0 && (
          <div className={styles.detailSection}>
            <div className={styles.sectionHeader}><CodeOutlined/> 变量定义 <span className={styles.countBadge}>{d.variables_schema.length}</span></div>
            <Table
              size="small"
              pagination={false}
              dataSource={d.variables_schema}
              rowKey="key"
              className={styles.varTable}>
              <Table.Column title="变量名" dataIndex="key" width={140} render={v => <Text code style={{fontSize: 12}}>{v}</Text>}/>
              <Table.Column title="类型" dataIndex="type" width={70} render={v => <Tag style={{margin: 0}}>{v}</Tag>}/>
              <Table.Column title="说明" dataIndex="label" ellipsis/>
              <Table.Column title="必填" dataIndex="required" width={60} align="center" render={v => v ? <Tag color="red" style={{margin: 0}}>是</Tag> : <span style={{color: 'var(--color-text-tertiary)'}}>否</span>}/>
              <Table.Column title="默认值" dataIndex="default" width={120} ellipsis render={v => v !== undefined && v !== null ? <Text type="secondary" style={{fontSize: 12}}>{String(v)}</Text> : <span style={{color: 'var(--color-text-tertiary)'}}>-</span>}/>
            </Table>
          </div>
        )}

        {d.readme && (
          <div className={styles.detailSection}>
            <div className={styles.sectionHeader}><FileTextOutlined/> README</div>
            <pre className={styles.readme}>{d.readme}</pre>
          </div>
        )}

        {d.install_error && (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined/>}
            message="安装失败"
            description={<pre className={styles.errorLog}>{d.install_error}</pre>}
            className={styles.errorAlert}
          />
        )}
      </div>
    );
  };

  render() {
    return (
      <AuthDiv auth="ansible.role.view">
        <Breadcrumb items={['首页', 'Ansible', 'Role 市场']}/>
        <SearchForm>
          <SearchForm.Item span={6} title="名称">
            <Input allowClear value={store.f_name} onChange={e => store.f_name = e.target.value} placeholder="搜索 Role 名称"/>
          </SearchForm.Item>
          <SearchForm.Item span={6} title="分类">
            <Select
              allowClear
              value={store.f_category}
              onChange={v => store.f_category = v}
              placeholder="全部分类"
              options={store.categories.map(c => ({value: c, label: c}))}/>
          </SearchForm.Item>
        </SearchForm>

        <div className={styles.toolbar}>
          <Space>
            <AuthButton auth="ansible.role.edit" type="primary" icon={<PlusOutlined/>} onClick={store.showAdd}>添加 Role 源</AuthButton>
            <Button icon={<HistoryOutlined/>} onClick={store.showDeployments}>部署记录</Button>
          </Space>
          <Button icon={<SyncOutlined/>} onClick={store.fetchRecords} loading={store.isFetching}>刷新</Button>
        </div>

        <Spin spinning={store.isFetching}>
          {store.dataSource.length === 0 ? (
            <Empty description="暂无 Role，点击「添加 Role 源」从 GitHub 导入" className={styles.emptyWrap}/>
          ) : (
            <Row gutter={[16, 16]} className={styles.cardGrid}>
              {store.dataSource.map(this.renderCard)}
            </Row>
          )}
        </Spin>

        {store.addVisible && <AddSourceForm/>}
        {store.deployVisible && <DeployForm/>}

        <Drawer
          title="Role 详情"
          placement="right"
          width={620}
          open={store.detailVisible}
          onClose={() => { store.detailVisible = false; store.detail = null; }}
          destroyOnClose
          extra={store.detail && (
            <Space>
              {store.detail.install_status === 'installed' && hasPermission('ansible.role.run') && (
                <Button type="primary" size="small" icon={<ThunderboltOutlined/>} onClick={() => {
                  store.showDeploy(store.detail);
                  store.detailVisible = false;
                }}>部署</Button>
              )}
              {store.detail.install_status === 'installing' && hasPermission('ansible.role.edit') && (
                <Button size="small" icon={<SyncOutlined/>} loading disabled>安装中</Button>
              )}
              {store.detail.install_status === 'installed' && hasPermission('ansible.role.edit') && (
                <Button size="small" icon={<SyncOutlined/>} loading={store.installingId === store.detail.id} onClick={() => store.installRole(store.detail.id)}>更新</Button>
              )}
              {hasPermission('ansible.role.edit') && (
                <Button size="small" danger icon={<DeleteOutlined/>} onClick={() => this.handleDelete(store.detail)}>删除</Button>
              )}
            </Space>
          )}>
          {this.renderDetail()}
        </Drawer>

        <Drawer
          title="部署记录"
          placement="right"
          width="55%"
          open={store.deploymentsVisible}
          onClose={() => store.deploymentsVisible = false}
          destroyOnClose>
          <Spin spinning={store.deploymentsFetching}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无部署记录" style={{display: store.deployments.length ? 'none' : 'block'}}/>
            {store.deployments.map(dep => (
              <Card key={dep.id} size="small" className={styles.deployCard}>
                <div className={styles.deployHeader}>
                  <Space>
                    <Text strong>{dep.name}</Text>
                    <Text type="secondary" style={{fontSize: 12}}>{dep.role_name}</Text>
                  </Space>
                  {this.renderDeployStatus(dep.status)}
                </div>
                <div className={styles.deployMeta}>
                  <Text type="secondary" style={{fontSize: 12}}>主机: {dep.host_ids?.length || 0} 台</Text>
                  <Text type="secondary" style={{fontSize: 12}}>|</Text>
                  <Text type="secondary" style={{fontSize: 12}}>{dep.duration}s</Text>
                  <Text type="secondary" style={{fontSize: 12}}>|</Text>
                  <Text type="secondary" style={{fontSize: 12}}>{dep.created_at}</Text>
                </div>
                {dep.run_token && (
                  <Button
                    type="link"
                    size="small"
                    icon={<HistoryOutlined/>}
                    onClick={() => {
                      store.deploymentsVisible = false;
                      setTimeout(() => store.switchOutput(dep.run_token), 300);
                    }}>
                    查看输出
                  </Button>
                )}
              </Card>
            ))}
          </Spin>
        </Drawer>

        <Drawer
          title="执行输出"
          placement="right"
          width="65%"
          open={store.showOutput}
          onClose={store.switchOutput}
          styles={{body: {padding: 0, height: 'calc(100vh - 55px)', overflow: 'hidden'}}}
          destroyOnClose>
          {store.showOutput && <Output/>}
        </Drawer>
      </AuthDiv>
    )
  }
}

export default RoleMarketIndex;