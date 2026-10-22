import React, { useState } from 'react';
import { observer } from 'mobx-react';
import { AppstoreOutlined } from '@ant-design/icons';
import S from './store';
import ConsoleNode from './Node';
import css from './sider.module.less';

const FILTERS = [
  { key: 'all', label: '全部', color: 'var(--color-text-secondary)' },
  { key: 'success', label: '成功', color: 'var(--color-green-500)' },
  { key: 'error', label: '失败', color: 'var(--color-red-500)' },
  { key: 'doing', label: '执行中', color: 'var(--color-primary)' },
];

function Sider(props) {
  const [filter, setFilter] = useState('all')

  const filteredNodes = S.nodes.filter(node => {
    if (filter === 'all') return true
    const status = S.outputs[String(node.id)]?.status
    return status === filter
  })

  const statusCounts = {all: props.total, success: props.successCount, error: props.errorCount, doing: props.doingCount}

  return (
    <div className={css.container}>
      <div className={css.header}>
        <span className={css.headerLeft}>
          <AppstoreOutlined className={css.headerIcon}/>
          <span className={css.headerTitle}>执行步骤</span>
        </span>
        <span className={css.count}>{props.total}</span>
      </div>

      <div className={css.filters}>
        {FILTERS.map(f => (
          <div
            key={f.key}
            className={`${css.filterTag} ${filter === f.key ? css.filterActive : ''}`}
            onClick={() => setFilter(f.key)}
          >
            <span className={css.filterDot} style={{background: f.color}}/>
            <span className={css.filterLabel}>{f.label}</span>
            <span className={css.filterCount}>{statusCounts[f.key] || 0}</span>
          </div>
        ))}
      </div>

      <div className={css.list}>
        {filteredNodes.map((node, index) => (
          <ConsoleNode key={node.id} node={node} index={index + 1} isLast={index === filteredNodes.length - 1}/>
        ))}
        {filteredNodes.length === 0 && (
          <div className={css.empty}>无匹配节点</div>
        )}
      </div>
    </div>
  )
}

export default observer(Sider)
