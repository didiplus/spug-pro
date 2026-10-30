import React, { useEffect, useMemo, useState, useRef } from 'react';
import { observer } from 'mobx-react';
import { Button, Select, Tag, Spin, Empty, Card, Space, Badge, message, Popconfirm } from 'antd';
import {
  ReloadOutlined, ApartmentOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, StopOutlined, SyncOutlined,
  DatabaseOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import store from '../store';
import styles from './ClusterTopology.module.less';

// ========== Constants ==========
const CARD_W = 176;
const CARD_H = 52;
const H_GAP = 24;
const V_GAP = 72;
const PAD = 40;

const ROLE_CFG = {
  primary:    { main: '#1677ff', tint: '#e6f4ff', label: '主' },
  master:     { main: '#1677ff', tint: '#e6f4ff', label: '主' },
  replica:    { main: '#52c41a', tint: '#f6ffed', label: '从' },
  slave:      { main: '#52c41a', tint: '#f6ffed', label: '从' },
  standalone: { main: '#8c8c8c', tint: '#fafafa', label: '独' },
};

const DB_TYPE_LABELS = {
  mysql: 'MySQL', mariadb: 'Maria', postgresql: 'PG', redis: 'Redis',
  mongodb: 'Mongo', mssql: 'MSSQL', oracle: 'Oracle', sqlite: 'SQLite',
  clickhouse: 'CK', elasticsearch: 'ES', cassandra: 'Cass', tidb: 'TiDB',
};

const HEALTH_CFG = {
  healthy: { label: '健康', status: 'success', icon: <CheckCircleOutlined /> },
  warning: { label: '告警', status: 'warning', icon: <ExclamationCircleOutlined /> },
  critical: { label: '严重', status: 'error', icon: <StopOutlined /> },
  unknown: { label: '未知', status: 'default', icon: <ExclamationCircleOutlined /> },
};

const TOPOLOGY_LABELS = {
  master_slave: '主从复制', master_master: '双主复制',
  standalone: '独立部署', unknown: '未知',
};

// ========== Layout (品字形 / 树形垂直) ==========
function layoutTopology(nodes, edges) {
  if (!nodes?.length) return { positioned: [], layoutEdges: [], width: 0, height: 0 };

  const nodeMap = new Map(nodes.map(n => [n.id, { ...n, x: 0, y: 0 }]));
  const childrenMap = new Map();
  const parentMap = new Map();
  for (const e of edges || []) {
    if (!childrenMap.has(e.from)) childrenMap.set(e.from, []);
    childrenMap.get(e.from).push(e.to);
    parentMap.set(e.to, e.from);
  }

  // BFS 分层
  const levels = new Map();
  const queue = [];
  for (const n of nodeMap.values()) {
    if (!parentMap.has(n.id)) { levels.set(n.id, 0); queue.push(n.id); }
  }
  while (queue.length) {
    const cur = queue.shift();
    const lv = levels.get(cur);
    for (const child of childrenMap.get(cur) || []) {
      const cl = lv + 1;
      if (!levels.has(child) || levels.get(child) < cl) { levels.set(child, cl); queue.push(child); }
    }
  }
  for (const n of nodeMap.values()) if (!levels.has(n.id)) levels.set(n.id, 0);

  const maxLevel = Math.max(...levels.values(), 0);
  const byLevel = Array.from({ length: maxLevel + 1 }, () => []);
  for (const n of nodeMap.values()) byLevel[levels.get(n.id)].push(n);

  // 计算每层宽度，取最宽层作为总宽
  const levelWidths = byLevel.map(row => row.length * CARD_W + (row.length - 1) * H_GAP);
  const maxRowW = Math.max(...levelWidths, CARD_W);

  // 品字形布局：每层水平居中
  const positioned = [];
  for (let lv = 0; lv <= maxLevel; lv++) {
    const row = byLevel[lv];
    const rowW = row.length * CARD_W + (row.length - 1) * H_GAP;
    let x = PAD + (maxRowW - rowW) / 2;
    const y = PAD + lv * (CARD_H + V_GAP);
    for (const n of row) { n.x = x; n.y = y; positioned.push(n); x += CARD_W + H_GAP; }
  }

  const width = PAD * 2 + maxRowW;
  const height = PAD * 2 + (maxLevel + 1) * CARD_H + maxLevel * V_GAP;

  // 边：从父节点底部中心 → 子节点顶部中心（垂直贝塞尔）
  const layoutEdges = (edges || []).map((e, i) => {
    const from = nodeMap.get(e.from);
    const to = nodeMap.get(e.to);
    if (!from || !to) return null;
    const x1 = from.x + CARD_W / 2, y1 = from.y + CARD_H;
    const x2 = to.x + CARD_W / 2, y2 = to.y;
    const dy = y2 - y1;
    const path = `M ${x1} ${y1} C ${x1} ${y1 + dy * 0.5}, ${x2} ${y2 - dy * 0.5}, ${x2} ${y2}`;
    return { ...e, id: `edge-${i}`, path, midX: (x1 + x2) / 2, midY: (y1 + y2) / 2 };
  }).filter(Boolean);

  return { positioned, layoutEdges, width, height };
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

// ========== SVG Node ==========
function SvgNode({ node, hovered, onHover, isPrimary, onSelect }) {
  const role = ROLE_CFG[node.role] || ROLE_CFG.standalone;
  const isOnline = node.status === 'online';
  const isDim = hovered !== null && hovered !== node.id;
  const lag = node.metrics?.lag;
  const dbLabel = DB_TYPE_LABELS[node.type] || node.type?.slice(0, 4).toUpperCase() || 'DB';
  const ver = node.metrics?.version ? truncate(String(node.metrics.version), 10) : '';

  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
      opacity={isDim ? 0.28 : 1}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => isOnline && onSelect?.(node)}
      style={{ cursor: isOnline ? 'pointer' : 'not-allowed', transition: 'opacity 0.2s' }}
    >
      {/* Pulsing ring for primary */}
      {isPrimary && (
        <rect x={-4} y={-4} width={CARD_W + 8} height={CARD_H + 8} rx={13}
          fill="none" stroke={role.main} strokeWidth={1.5}>
          <animate attributeName="opacity" values="0.4;0.05;0.4" dur="3s" repeatCount="indefinite" />
          <animate attributeName="stroke-width" values="1.5;3;1.5" dur="3s" repeatCount="indefinite" />
        </rect>
      )}

      {/* Card */}
      <rect width={CARD_W} height={CARD_H} rx={9} fill="var(--color-bg-container)"
        stroke={!isOnline ? '#ff4d4f' : isPrimary ? role.main : 'var(--color-border-secondary)'}
        strokeWidth={!isOnline || isPrimary ? 1.5 : 1}
        filter="url(#card-shadow)" />


      {/* Icon box */}
      <rect x={9} y={11} width={28} height={28} rx={6} fill={role.tint} />
      <text x={23} y={29} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={role.main}>
        {dbLabel}
      </text>

      {/* Node name */}
      <text x={43} y={19} fontSize="12" fontWeight="600" fill="var(--color-text)">
        {truncate(node.name, 14)}
      </text>

      {/* Host:port */}
      <text x={43} y={33} fontSize="10" fontFamily="'SF Mono',Monaco,monospace" fill="var(--color-text-secondary)">
        {truncate(`${node.host}:${node.port}`, 16)}
      </text>

      {/* Version (inline, right side) */}
      {ver && (
        <text x={CARD_W - 8} y={33} textAnchor="end" fontSize="9" fill="var(--color-text-tertiary)">
          {ver}
        </text>
      )}

      {/* Role tag */}
      <rect x={CARD_W - 30} y={6} width={22} height={14} rx={7} fill={role.main} />
      <text x={CARD_W - 19} y={16} textAnchor="middle" fontSize="8.5" fontWeight="500" fill="#fff">
        {role.label}
      </text>

      {/* Status dot + breathing ring */}
      <circle cx={CARD_W - 10} cy={CARD_H - 10} r={2.5} fill={isOnline ? '#52c41a' : '#ff4d4f'}>
        {isOnline && (
          <animate attributeName="opacity" values="1;0.4;1" dur="2.4s" repeatCount="indefinite" />
        )}
      </circle>
      {isOnline && (
        <circle cx={CARD_W - 10} cy={CARD_H - 10} r={2.5} fill="none" stroke="#52c41a" strokeWidth={1}>
          <animate attributeName="r" values="2.5;6;2.5" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="2.4s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Lag */}
      {lag != null && (
        <text x={9} y={CARD_H - 5} fontSize="9" fill="#faad14" fontWeight="500">
          ⏱{lag}s
        </text>
      )}

      {/* Connections */}
      {node.metrics?.connections != null && (
        <text x={CARD_W - 24} y={CARD_H - 5} textAnchor="end" fontSize="9" fill="var(--color-text-tertiary)">
          {node.metrics.connections}c
        </text>
      )}

      <title>
        {`${node.name} (${role.label})\n${node.host}:${node.port}\n状态: ${isOnline ? '在线' : '离线'}${node.metrics?.version ? '\n版本: ' + node.metrics.version : ''}${lag != null ? '\n延迟: ' + lag + 's' : ''}${node.metrics?.connections != null ? '\n连接: ' + node.metrics.connections : ''}`}
      </title>
    </g>
  );
}

// ========== SVG Edge ==========
function SvgEdge({ edge, hovered, index, hasOffline }) {
  const isHighlight = hovered === edge.from || hovered === edge.to;
  const isRed = hasOffline;
  const isDim = hovered !== null && !isHighlight;
  const dur = 3.6;
  const stagger = (index % 8) * 0.045;
  const visStart = 0.12 + stagger;
  const visEnd = 0.52 + stagger;
  const fade = 0.02;

  return (
    <g opacity={isDim ? 0.1 : 1} style={{ transition: 'opacity 0.2s' }}>
      {/* Glow underlay */}
      <path d={edge.path} fill="none" stroke={isRed ? '#ff4d4f' : '#1677ff'}
        strokeWidth={isHighlight ? 5 : 3.5} strokeOpacity={0.08} strokeLinecap="round" />

      {/* Main wire */}
      <path d={edge.path} fill="none"
        stroke={isRed ? '#ff4d4f' : isHighlight ? '#1677ff' : 'url(#wire-grad-v)'}
        strokeWidth={isHighlight ? 2 : 1.5}
        strokeOpacity={isRed ? 0.7 : isHighlight ? 0.85 : 0.5}
        markerEnd={isHighlight ? undefined : undefined} />

      {/* Particle 1 */}
      <circle r={isHighlight ? 3.5 : 2.8} fill={isRed ? '#ff4d4f' : '#1677ff'}>
        <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={edge.path} />
        <animate attributeName="opacity" dur={`${dur}s`} repeatCount="indefinite"
          keyTimes={`0;${visStart - fade};${visStart};${visEnd};${visEnd + fade};1`}
          values="0;0;1;1;0;0" />
      </circle>

      {/* Particle 2 */}
      <circle r={isHighlight ? 2.5 : 2} fill={isRed ? '#ff7875' : '#4096ff'}>
        <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={edge.path} begin={`${dur * 0.5}s`} />
        <animate attributeName="opacity" dur={`${dur}s`} repeatCount="indefinite" begin={`${dur * 0.5}s`}
          keyTimes={`0;${visStart - fade};${visStart};${visEnd};${visEnd + fade};1`}
          values="0;0;1;1;0;0" />
      </circle>

      {/* Edge label */}
      {edge.label && (
        <g>
          <rect x={edge.midX - 26} y={edge.midY - 8} width={52} height={16} rx={8}
            fill="var(--color-bg-container)" stroke="var(--color-border-secondary)" strokeWidth={1} />
          <text x={edge.midX} y={edge.midY + 3.5} textAnchor="middle" fontSize="9.5"
            fill="var(--color-text-secondary)">
            {edge.label}
          </text>
        </g>
      )}
    </g>
  );
}

// ========== Topology Graph ==========
const TopologyGraph = observer(function TopologyGraph() {
  const data = store.topologyData;
  const { positioned, layoutEdges, width, height } = useMemo(
    () => layoutTopology(data?.nodes, data?.edges), [data]
  );
  const [hovered, setHovered] = useState(null);
  const [viewBox, setViewBox] = useState(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    setViewBox(null);
  }, [data]);

  const handleWheel = (e) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * (viewBox?.w || width);
    const my = ((e.clientY - rect.top) / rect.height) * (viewBox?.h || height);
    const scale = e.deltaY > 0 ? 1.15 : 0.87;
    const cur = viewBox || { x: 0, y: 0, w: width, h: height };
    const nw = Math.max(100, Math.min(cur.w * scale, width * 4));
    const nh = Math.max(100, Math.min(cur.h * scale, height * 4));
    const nx = cur.x + (mx - cur.x) * (1 - nw / cur.w);
    const ny = cur.y + (my - cur.y) * (1 - nh / cur.h);
    setViewBox({ x: nx, y: ny, w: nw, h: nh });
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, vb: viewBox || { x: 0, y: 0, w: width, h: height } };
  };

  const handleMouseMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((e.clientX - drag.startX) / rect.width) * drag.vb.w;
    const dy = ((e.clientY - drag.startY) / rect.height) * drag.vb.h;
    setViewBox({ x: drag.vb.x - dx, y: drag.vb.y - dy, w: drag.vb.w, h: drag.vb.h });
  };

  const handleMouseUp = () => { dragRef.current = null; };

  const vb = viewBox || { x: 0, y: 0, w: width, h: height };

  if (!positioned?.length) return <Empty description="无拓扑数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  const primaryIds = new Set(
    positioned.filter(n => n.role === 'primary' || n.role === 'master').map(n => n.id)
  );

  return (
    <div className={styles.graphWrap}>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className={styles.svgGraph}
        preserveAspectRatio="xMidYMid meet"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
      >
        <defs>
          <pattern id="topo-grid" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="1.2" cy="1.2" r="1.2" className={styles.gridDot} />
          </pattern>
          <radialGradient id="grid-fade" cx="50%" cy="40%" r="68%">
            <stop offset="0" stopColor="#fff" />
            <stop offset=".55" stopColor="#fff" />
            <stop offset="1" stopColor="#000" />
          </radialGradient>
          <mask id="grid-mask">
            <rect width={width} height={height} fill="url(#grid-fade)" />
          </mask>
          {/* Vertical wire gradient (top→bottom) */}
          <linearGradient id="wire-grad-v" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1677ff" stopOpacity="0.6" />
            <stop offset="1" stopColor="#91caff" stopOpacity="0.4" />
          </linearGradient>
          <filter id="card-shadow" x="-20%" y="-30%" width="140%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#1e2a44" floodOpacity="0.07" />
          </filter>
          <marker id="arrow" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
            <polygon points="0 0, 6 2, 0 4" fill="#bfbfbf" />
          </marker>
          <marker id="arrow-hi" markerWidth="7" markerHeight="4.5" refX="7" refY="2.25" orient="auto">
            <polygon points="0 0, 7 2.25, 0 4.5" fill="#1677ff" />
          </marker>
        </defs>

        {/* Grid background */}
        <rect width={width} height={height} fill="url(#topo-grid)" mask="url(#grid-mask)" />

        {/* Edges */}
        {layoutEdges.map((e, i) => {
          const fromNode = positioned.find(n => n.id === e.from);
          const toNode = positioned.find(n => n.id === e.to);
          const hasOffline = (fromNode && fromNode.status !== 'online') || (toNode && toNode.status !== 'online');
          return <SvgEdge key={e.id} edge={e} hovered={hovered} index={i} hasOffline={hasOffline} />;
        })}

        {/* Nodes */}
        {positioned.map(node => (
          <SvgNode key={node.id} node={node} hovered={hovered} onHover={setHovered}
            isPrimary={primaryIds.has(node.id)}
            onSelect={(n) => store.showDetail({ id: n.id, name: n.name, type: n.type, host: n.host, port: n.port, status: n.status === 'online' ? 0 : 1 })} />
        ))}
      </svg>
    </div>
  );
});

// ========== Cluster Selector ==========
const ClusterSelector = observer(function ClusterSelector() {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarLeft}>
        <div className={styles.toolbarBadge}>
          <DatabaseOutlined />
        </div>
        <Select
          placeholder="选择集群"
          style={{ width: 220 }}
          value={store.activeCluster}
          loading={store.clustersLoading}
          onChange={val => store.loadTopology(val)}
          options={store.clusters.map(c => ({
            value: c.name,
            label: (
              <div className={styles.clusterOption}>
                <span>{c.name}</span>
                <Tag color={HEALTH_CFG[c.health_status]?.status} style={{ margin: 0 }}>
                  {c.online}/{c.total}
                </Tag>
              </div>
            ),
          }))}
        />
      </div>
      <Space>
        <Button icon={<ReloadOutlined />} onClick={() => store.loadClusters()} loading={store.clustersLoading}>
          刷新
        </Button>
        <Popconfirm
          title="自动发现将查询所有实例的复制关系并自动分组，确认执行？"
          onConfirm={async () => {
            try {
              const res = await store.autoDiscoverClusters();
              message.success(res.message || '自动发现完成');
              if (res.diagnostics && res.diagnostics.length > 0) {
                console.table(res.diagnostics);
                const issues = res.diagnostics.filter(d => !d.link);
                if (issues.length > 0) {
                  message.warning(`${issues.length} 个实例未发现复制关系，详情见控制台`, 5);
                }
              }
            } catch {
              message.error('自动发现失败');
            }
          }}
        >
          <Button icon={<ThunderboltOutlined />} loading={store.autoDiscoverLoading}>
            自动发现
          </Button>
        </Popconfirm>
        {store.activeCluster && (
          <Popconfirm
            title="确认重新发现拓扑？"
            onConfirm={async () => {
              try { await store.discoverCluster(store.activeCluster); message.success('拓扑发现完成'); }
              catch { message.error('拓扑发现失败'); }
            }}
          >
            <Button type="primary" icon={<SyncOutlined />} loading={store.topologyLoading}>
              发现拓扑
            </Button>
          </Popconfirm>
        )}
      </Space>
    </div>
  );
});

// ========== Info Bar ==========
const InfoBar = observer(function InfoBar() {
  const data = store.topologyData;
  if (!data) return null;
  const health = HEALTH_CFG[data.health_status] || HEALTH_CFG.unknown;
  const online = data.nodes.filter(n => n.status === 'online').length;
  const offline = data.node_count - online;

  return (
    <div className={styles.infoBar}>
      <div className={styles.infoItem}>
        <ApartmentOutlined className={styles.infoIcon} />
        <span className={styles.infoText}>{TOPOLOGY_LABELS[data.topology_type] || data.topology_type}</span>
      </div>
      <div className={styles.infoSep} />
      <div className={styles.infoItem}>
        <span className={styles.infoNum}>{data.node_count}</span>
        <span className={styles.infoLabel}>节点</span>
      </div>
      <div className={styles.infoSep} />
      <div className={styles.infoItem}>
        <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />
        <span className={styles.infoNum} style={{ color: '#52c41a' }}>{online}</span>
        <span className={styles.infoLabel}>在线</span>
      </div>
      {offline > 0 && (
        <>
          <div className={styles.infoSep} />
          <div className={styles.infoItem}>
            <StopOutlined style={{ color: '#ff4d4f', fontSize: 14 }} />
            <span className={styles.infoNum} style={{ color: '#ff4d4f' }}>{offline}</span>
            <span className={styles.infoLabel}>离线</span>
          </div>
        </>
      )}
      <div className={styles.infoSep} />
      <Badge status={health.status} text={health.label} />
    </div>
  );
});

// ========== Main Component ==========
export default observer(function ClusterTopology() {
  useEffect(() => {
    store.loadClusters();
    return () => store.clearTopology();
  }, []);

  return (
    <div className={styles.wrapper}>
      <ClusterSelector />
      <Spin spinning={store.topologyLoading} tip="正在发现拓扑...">
        {store.topologyData ? (
          <>
            <InfoBar />
            <Card size="small" className={styles.graphCard}>
              <TopologyGraph />
            </Card>
          </>
        ) : (
          <div className={styles.emptyState}>
            <ApartmentOutlined className={styles.emptyIcon} />
            <p className={styles.emptyText}>
              {store.clusters.length === 0 ? '暂无集群，请在实例配置中填写集群名称' : '请选择一个集群查看拓扑'}
            </p>
          </div>
        )}
      </Spin>
    </div>
  );
});