export const statusMap = {
  success: {color: 'success', text: '正常'},
  warning: {color: 'warning', text: '告警'},
  error: {color: 'error', text: '失败'},
  pending: {color: 'default', text: '待执行'},
  running: {color: 'processing', text: '执行中'},
};

export function computeStats(results) {
  const total = results.length;
  const success = results.filter(r => r.status === 'success').length;
  const warning = results.filter(r => r.status === 'warning').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const pending = results.filter(r => r.status === 'pending' || r.status === 'running').length;
  const passRate = total > 0 ? Math.round(success / total * 1000) / 10 : 0;
  const passColor = passRate === 100 ? 'var(--color-green-600)' : (passRate >= 60 ? 'var(--color-gold-500)' : 'var(--color-red-600)');
  const isNormal = warning === 0 && errorCount === 0;
  return {total, success, warning, errorCount, pending, passRate, passColor, isNormal};
}

export function groupByHost(results) {
  const hostMap = {};
  results.forEach(r => {
    if (!hostMap[r.host_id]) hostMap[r.host_id] = {name: r.host_name, items: []};
    hostMap[r.host_id].items.push(r);
  });
  return Object.values(hostMap).map(info => {
    const stats = computeStats(info.items);
    return {...info, ...stats};
  });
}