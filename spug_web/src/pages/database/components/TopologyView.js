import React, { useState, useEffect, useCallback, useRef } from 'react';
import { observer } from 'mobx-react';
import {
  Spin, Empty, Tag, Tooltip, Button, Flex, Typography, Alert,
} from 'antd';
import {
  ReloadOutlined, ZoomInOutlined, ZoomOutOutlined, FullscreenOutlined,
  DatabaseOutlined, ThunderboltOutlined, CheckCircleOutlined, SwapOutlined,
} from '@ant-design/icons';
import { http } from 'libs';
import store from '../store';
import { DB_TYPES } from '../dbTypes';

const { Text } = Typography;

const TYPE_COLORS = Object.fromEntries(Object.entries(DB_TYPES).map(([k, v]) => [k, v.hexColor]));

const ROLE_CONFIG = {
  master: { label: '主库', color: '#1677ff', bg: '#e6f4ff', border: '#91caff' },
  slave: { label: '从库', color: '#52c41a', bg: '#f6ffed', border: '#b7eb8f' },
  replica: { label: '副本', color: '#52c41a', bg: '#f6ffed', border: '#b7eb8f' },
  standalone: { label: '独立', color: '#8c8c8c', bg: '#fafafa', border: '#d9d9d9' },
};

const EDGE_STATUS = {
  running: { color: '#52c41a', label: '正常' },
  stopped: { color: '#ff4d4f', label: '停止' },
  error: { color: '#ff4d4f', label: '错误' },
  unknown: { color: '#d9d9d9', label: '未知' },
};

const NODE_W = 220;
const NODE_H = 90;
const H_GAP = 60;
const V_GAP = 100;
const GROUP_PAD = 24;
const GROUP_LABEL_H = 28;

function layoutNodes(nodes, edges, clusters) {
  const nodeMap = {};
  nodes.forEach((n) => { nodeMap[n.id] = n; });

  const childMap = {};
  const childSet = new Set();
  edges.forEach((e) => {
    if (!childMap[e.source]) childMap[e.source] = [];
    childMap[e.source].push(e.target);
    childSet.add(e.target);
  });

  const positioned = {};
  const positions = {};

  function assignLevel(nodeId, x, y) {
    if (positioned[nodeId]) return;
    positioned[nodeId] = true;
    positions[nodeId] = { x, y };
    const children = childMap[nodeId] || [];
    const totalW = children.length * NODE_W + (children.length - 1) * H_GAP;
    const startX = x + NODE_W / 2 - totalW / 2;
    children.forEach((childId, i) => {
      assignLevel(childId, startX + i * (NODE_W + H_GAP), y + NODE_H + V_GAP);
    });
  }

  let nextX = 40;
  const clusterNames = Object.keys(clusters || {});

  clusterNames.forEach((clusterName) => {
    const memberIds = clusters[clusterName];
    const masters = memberIds.filter((id) => nodeMap[id]?.role === 'master');
    const slaves = memberIds.filter((id) => nodeMap[id]?.role === 'slave' || nodeMap[id]?.role === 'replica');
    const others = memberIds.filter((id) => !masters.includes(id) && !slaves.includes(id));

    const allRoots = [...masters, ...others];
    if (allRoots.length === 0 && slaves.length > 0) allRoots.push(slaves[0]);

    allRoots.forEach((rootId) => {
      assignLevel(rootId, nextX, 40);
      const children = childMap[rootId] || [];
      const groupW = Math.max(NODE_W, children.length * NODE_W + (children.length - 1) * H_GAP);
      nextX += groupW + H_GAP + GROUP_PAD * 2;
    });

    slaves.forEach((slaveId) => {
      if (!positioned[slaveId]) {
        const parentId = Object.keys(childMap).find((k) => childMap[k].includes(slaveId));
        if (parentId && positions[parentId]) {
          const siblings = childMap[parentId] || [];
          const idx = siblings.indexOf(slaveId);
          const totalW = siblings.length * NODE_W + (siblings.length - 1) * H_GAP;
          const startX = positions[parentId].x + NODE_W / 2 - totalW / 2;
          assignLevel(slaveId, startX + idx * (NODE_W + H_GAP), positions[parentId].y + NODE_H + V_GAP);
        }
      }
    });
  });

  const roots = nodes.filter((n) => !childSet.has(n.id) && !positioned[n.id]);
  roots.forEach((root) => {
    assignLevel(root.id, nextX, 40);
    const children = childMap[root.id] || [];
    const groupW = Math.max(NODE_W, children.length * NODE_W + (children.length - 1) * H_GAP);
    nextX += groupW + H_GAP + GROUP_PAD * 2;
  });

  nodes.forEach((n) => {
    if (!positioned[n.id]) {
      const col = Object.keys(positioned).length % 3;
      const row = Math.floor(Object.keys(positioned).length / 3);
      positions[n.id] = { x: 40 + col * (NODE_W + H_GAP), y: 40 + row * (NODE_H + V_GAP) };
    }
  });

  return positions;
}

function computeGroups(nodes, edges, positions, clusters) {
  const groups = [];
  const grouped = new Set();

  Object.keys(clusters || {}).forEach((clusterName) => {
    const memberIds = clusters[clusterName];
    const pts = memberIds.map((id) => positions[id]).filter(Boolean);
    if (pts.length === 0) return;
    memberIds.forEach((id) => grouped.add(id));
    const minX = Math.min(...pts.map((p) => p.x)) - GROUP_PAD;
    const minY = Math.min(...pts.map((p) => p.y)) - GROUP_PAD - GROUP_LABEL_H;
    const maxX = Math.max(...pts.map((p) => p.x + NODE_W)) + GROUP_PAD;
    const maxY = Math.max(...pts.map((p) => p.y + NODE_H)) + GROUP_PAD;
    const masterNode = nodes.find((n) => memberIds.includes(n.id) && n.role === 'master');
    const slaveCount = nodes.filter((n) => memberIds.includes(n.id) && (n.role === 'slave' || n.role === 'replica')).length;
    const type = masterNode ? masterNode.type : 'mysql';
    groups.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY, label: clusterName, type, slaveCount });
  });

  edges.forEach((edge) => {
    if (grouped.has(edge.source) && grouped.has(edge.target)) return;
    const cluster = new Set();
    const queue = [edge.source, edge.target];
    while (queue.length > 0) {
      const id = queue.shift();
      if (cluster.has(id) || grouped.has(id)) continue;
      cluster.add(id);
      grouped.add(id);
      edges.forEach((e) => {
        if (e.source === id && !cluster.has(e.target) && !grouped.has(e.target)) queue.push(e.target);
        if (e.target === id && !cluster.has(e.source) && !grouped.has(e.source)) queue.push(e.source);
      });
    }
    const pts = [...cluster].map((id) => positions[id]).filter(Boolean);
    if (pts.length === 0) return;
    const minX = Math.min(...pts.map((p) => p.x)) - GROUP_PAD;
    const minY = Math.min(...pts.map((p) => p.y)) - GROUP_PAD - GROUP_LABEL_H;
    const maxX = Math.max(...pts.map((p) => p.x + NODE_W)) + GROUP_PAD;
    const maxY = Math.max(...pts.map((p) => p.y + NODE_H)) + GROUP_PAD;
    const masterNode = nodes.find((n) => cluster.has(n.id) && n.role === 'master');
    const slaveCount = nodes.filter((n) => cluster.has(n.id) && (n.role === 'slave' || n.role === 'replica')).length;
    const type = masterNode ? masterNode.type : 'mysql';
    groups.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY, label: masterNode ? `${masterNode.name} 主备集群` : '复制集群', type, slaveCount });
  });

  return groups;
}

function TopologyNode({ node, pos, onClick }) {
  const typeColor = TYPE_COLORS[node.type] || '#8c8c8c';
  const roleCfg = ROLE_CONFIG[node.role] || ROLE_CONFIG.standalone;
  const isOnline = node.status === 0;
  const isExternal = node.external;
  const repl = node.replication;

  return (
    <g transform={`translate(${pos.x}, ${pos.y})`} onClick={onClick} style={{ cursor: isExternal ? 'default' : 'pointer' }}>
      <rect width={NODE_W} height={NODE_H} rx={8} ry={8}
        fill={isExternal ? '#fff7e6' : roleCfg.bg}
        stroke={isOnline ? roleCfg.border : '#ff4d4f'}
        strokeWidth={2} strokeDasharray={isExternal ? '6,3' : 'none'} filter="url(#shadow)" />
      {node.role === 'master' && (
        <React.Fragment>
          <rect x={NODE_W - 58} y={0} width={58} height={22} rx={8} fill={roleCfg.color} />
          <text x={NODE_W - 29} y={14} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={10} fontWeight={600}>MASTER</text>
        </React.Fragment>
      )}
      <foreignObject x={8} y={4} width={NODE_W - 16} height={NODE_H - 8}>
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <DatabaseOutlined style={{ color: typeColor, fontSize: 14 }} />
            <span style={{ fontWeight: 600, fontSize: 13, color: '#262626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
            {node.role !== 'master' && <Tag color={roleCfg.color} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{roleCfg.label}</Tag>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag color={isOnline ? 'success' : 'error'} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{isOnline ? '在线' : '离线'}</Tag>
            <span style={{ fontSize: 11, color: '#8c8c8c' }}>{node.host}:{node.port}</span>
          </div>
          {node.version && <div style={{ fontSize: 10, color: '#bfbfbf', marginTop: 1 }}>{node.type.toUpperCase()} {node.version}</div>}
          {repl && node.role === 'slave' && repl.delay !== undefined && repl.delay !== null && (
            <div style={{ fontSize: 10, color: repl.delay > 10 ? '#ff4d4f' : '#52c41a', marginTop: 1 }}>延迟: {repl.delay}s</div>
          )}
          {repl && node.role === 'master' && repl.slave_count > 0 && (
            <div style={{ fontSize: 10, color: '#8c8c8c', marginTop: 1 }}>{repl.slave_count} 个从库</div>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

function TopologyEdge({ edge, positions }) {
  const sourcePos = positions[edge.source];
  const targetPos = positions[edge.target];
  if (!sourcePos || !targetPos) return null;

  const sx = sourcePos.x + NODE_W / 2;
  const sy = sourcePos.y + NODE_H;
  const tx = targetPos.x + NODE_W / 2;
  const ty = targetPos.y;
  const midY = (sy + ty) / 2;
  const path = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;

  const statusCfg = EDGE_STATUS[edge.status] || EDGE_STATUS.unknown;
  const isDashed = edge.status === 'stopped' || edge.status === 'error';
  const isRunning = edge.status === 'running';
  const labelX = (sx + tx) / 2;
  const labelY = midY;
  const delayText = edge.delay !== undefined && edge.delay !== null ? ` ${edge.delay}s` : '';
  const label = edge.label || '复制';

  return (
    <g>
      {isRunning && (
        <path d={path} fill="none" stroke={statusCfg.color} strokeWidth={2} strokeDasharray="8,4" opacity={0.4}>
          <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1.5s" repeatCount="indefinite" />
        </path>
      )}
      <path d={path} fill="none" stroke={statusCfg.color} strokeWidth={2}
        strokeDasharray={isDashed ? '6,3' : 'none'} markerEnd="url(#arrowhead)" />
      <g transform={`translate(${labelX}, ${labelY})`}>
        <rect x={-40} y={-12} width={80} height={24} rx={12} fill={statusCfg.color} opacity={0.1}
          stroke={statusCfg.color} strokeWidth={0.5} strokeOpacity={0.3} />
        <text textAnchor="middle" dominantBaseline="central" fill={statusCfg.color} fontSize={11} fontWeight={500}>
          {label}{delayText}
        </text>
      </g>
    </g>
  );
}

function TopologyGroup({ group }) {
  const typeColor = TYPE_COLORS[group.type] || '#8c8c8c';
  return (
    <g>
      <rect x={group.x} y={group.y} width={group.w} height={group.h} rx={12} ry={12}
        fill={typeColor} fillOpacity={0.03} stroke={typeColor} strokeWidth={1.5}
        strokeDasharray="8,4" strokeOpacity={0.3} />
      <g transform={`translate(${group.x + 12}, ${group.y + 16})`}>
        <SwapOutlined style={{ color: typeColor }} />
      </g>
      <text x={group.x + 30} y={group.y + 16} dominantBaseline="central" fill={typeColor} fontSize={12} fontWeight={500}>
        {group.label}
      </text>
      <text x={group.x + group.w - 12} y={group.y + 16} textAnchor="end" dominantBaseline="central"
        fill={typeColor} fontSize={11} opacity={0.7}>{group.slaveCount} 从库</text>
    </g>
  );
}

export default observer(function TopologyView() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [scale, setScale] = useState(1);
  const [positions, setPositions] = useState({});
  const [groups, setGroups] = useState([]);
  const containerRef = useRef(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    http.get('/api/db/topology/')
      .then((res) => {
        const clusters = res.clusters || {};
        const pos = layoutNodes(res.nodes || [], res.edges || [], clusters);
        setData(res);
        setPositions(pos);
        setGroups(computeGroups(res.nodes || [], res.edges || [], pos, clusters));
      })
      .catch((err) => setError(err.response ? err.response.data ? err.response.data.error : err.message : err.message || '获取拓扑失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.2, 2));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.2, 0.4));
  const handleReset = () => setScale(1);

  const handleNodeClick = (node) => {
    if (node.external || !node.instance_id) return;
    const inst = store.list.find((r) => r.id === node.instance_id);
    if (inst) store.showDetail(inst);
  };

  if (loading && !data) {
    return (<Flex justify="center" align="center" style={{ padding: '80px 0' }}><Spin size="large" tip="加载拓扑数据..." /></Flex>);
  }

  if (error) {
    return (
      <Flex vertical gap={12} style={{ padding: 16 }}>
        <Alert type="error" message={error} showIcon closable onClose={() => setError(null)} />
        <Button icon={<ReloadOutlined />} onClick={fetchData}>重试</Button>
      </Flex>
    );
  }

  if (!data || !data.nodes || data.nodes.length === 0) {
    return (<Flex justify="center" align="center" style={{ padding: '80px 0' }}><Empty description="暂无数据库实例，请先添加数据库连接" /></Flex>);
  }

  const nodes = data.nodes || [];
  const edges = data.edges || [];
  const allX = Object.values(positions).map((p) => p.x);
  const allY = Object.values(positions).map((p) => p.y);
  const svgW = (Math.max(...allX, 0) + NODE_W + 60) * scale;
  const svgH = (Math.max(...allY, 0) + NODE_H + 60) * scale;

  const masterCount = nodes.filter((n) => n.role === 'master').length;
  const slaveCount = nodes.filter((n) => n.role === 'slave' || n.role === 'replica').length;
  const standaloneCount = nodes.filter((n) => n.role === 'standalone').length;

  return (
    <Flex vertical gap={12}>
      <Flex justify="space-between" align="center">
        <Flex gap={16} align="center">
          <Text strong style={{ fontSize: 14 }}>数据库拓扑</Text>
          <Flex gap={4}>
            {masterCount > 0 && <Tag color="blue" icon={<ThunderboltOutlined />}>主库 {masterCount}</Tag>}
            {slaveCount > 0 && <Tag color="green" icon={<CheckCircleOutlined />}>从库 {slaveCount}</Tag>}
            {standaloneCount > 0 && <Tag color="default">独立 {standaloneCount}</Tag>}
            {edges.length > 0 && <Tag color="cyan" icon={<SwapOutlined />}>复制关系 {edges.length}</Tag>}
          </Flex>
        </Flex>
        <Flex gap={4}>
          <Tooltip title="放大"><Button size="small" icon={<ZoomInOutlined />} onClick={handleZoomIn} /></Tooltip>
          <Tooltip title="缩小"><Button size="small" icon={<ZoomOutOutlined />} onClick={handleZoomOut} /></Tooltip>
          <Tooltip title="重置"><Button size="small" icon={<FullscreenOutlined />} onClick={handleReset} /></Tooltip>
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={fetchData}>刷新</Button>
        </Flex>
      </Flex>

      <div ref={containerRef} style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'auto', background: '#fafafa', minHeight: 400 }}>
        <svg width={Math.max(svgW, 600)} height={Math.max(svgH, 400)} style={{ display: 'block' }}>
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 7 3.5, 0 7" fill="#8c8c8c" />
            </marker>
            <filter id="shadow" x="-5%" y="-5%" width="110%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.08" />
            </filter>
          </defs>
          <g transform={`scale(${scale})`}>
            {groups.map((group, i) => <TopologyGroup key={`group-${i}`} group={group} />)}
            {edges.map((edge) => <TopologyEdge key={`${edge.source}-${edge.target}`} edge={edge} positions={positions} />)}
            {nodes.map((node) => <TopologyNode key={node.id} node={node} pos={positions[node.id] || { x: 0, y: 0 }} onClick={() => handleNodeClick(node)} />)}
          </g>
        </svg>
      </div>

      <Flex justify="center" gap={24} style={{ padding: '8px 0' }}>
        <Flex align="center" gap={6}>
          <div style={{ width: 24, height: 2, background: '#52c41a' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>复制正常</Text>
        </Flex>
        <Flex align="center" gap={6}>
          <div style={{ width: 24, height: 0, borderTop: '2px dashed #ff4d4f' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>复制停止</Text>
        </Flex>
        <Flex align="center" gap={6}>
          <div style={{ width: 14, height: 14, borderRadius: 3, border: '1.5px dashed #1677ff', opacity: 0.5 }} />
          <Text type="secondary" style={{ fontSize: 12 }}>主备集群</Text>
        </Flex>
        <Flex align="center" gap={6}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: '#e6f4ff', border: '1.5px solid #91caff' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>主库</Text>
        </Flex>
        <Flex align="center" gap={6}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: '#f6ffed', border: '1.5px solid #b7eb8f' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>从库</Text>
        </Flex>
      </Flex>
    </Flex>
  );
});
