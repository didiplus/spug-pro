import http from 'libs/http';

let cachedMenus = null;
let fetchingPromise = null;

export function fetchMenuTree() {
  if (cachedMenus) return Promise.resolve(cachedMenus);
  if (fetchingPromise) return fetchingPromise;
  fetchingPromise = http.get('/api/setting/menus/manage/').then(res => {
    cachedMenus = res;
    fetchingPromise = null;
    return res;
  }).catch(() => {
    fetchingPromise = null;
    return [];
  });
  return fetchingPromise;
}

export function clearCodesCache() {
  cachedMenus = null;
}

function parsePerms(perms) {
  if (!perms) return null;
  const firstCode = perms.split('|')[0];
  const parts = firstCode.split('.');
  if (parts.length >= 3) {
    return { module: parts[0], page: parts[1], perm: parts[2] };
  } else if (parts.length === 2) {
    return { module: parts[0], page: parts[0], perm: parts[1] };
  }
  return null;
}

function buildPageNode(menu) {
  const node = {
    key: `page_${menu.id}`,
    title: menu.menu_name,
    perms: menu.perms,
  };

  const permChildren = [];
  if (menu.children) {
    for (const child of menu.children) {
      if (child.status === '1') continue;
      if (child.menu_type === 'F' && child.perms) {
        permChildren.push({
          key: `perm_${child.id}`,
          title: child.menu_name,
          perms: child.perms,
          isLeaf: true,
        });
      }
    }
  }

  if (permChildren.length === 0 && menu.perms) {
    permChildren.push({
      key: `perm_${menu.id}_default`,
      title: '查看',
      perms: menu.perms,
      isLeaf: true,
    });
  }

  if (permChildren.length > 0) {
    node.children = permChildren;
  }

  return node;
}

export function buildTreeData(menus) {
  const result = [];

  for (const m of menus) {
    if (m.status === '1' || m.menu_type === 'F' || !m.perms) continue;

    const pages = [];

    if (m.menu_type === 'M') {
      if (m.children) {
        for (const child of m.children) {
          if (child.status === '1') continue;
          if (child.menu_type === 'C' && child.perms) {
            pages.push(buildPageNode(child));
          }
        }
      }
    } else if (m.menu_type === 'C') {
      pages.push(buildPageNode(m));
      if (m.children) {
        for (const child of m.children) {
          if (child.status === '1') continue;
          if (child.menu_type === 'C' && child.visible === '1' && child.perms) {
            pages.push(buildPageNode(child));
          }
        }
      }
    }

    if (pages.length > 0) {
      result.push({
        key: `mod_${m.id}`,
        title: m.menu_name,
        perms: m.perms,
        children: pages,
      });
    }
  }

  return result;
}

export function collectAllKeys(treeData, result = []) {
  for (const node of treeData) {
    result.push(node.key);
    if (node.children) {
      collectAllKeys(node.children, result);
    }
  }
  return result;
}

export function collectLeafPerms(treeData, result = []) {
  for (const node of treeData) {
    if (node.children && node.children.length > 0) {
      collectLeafPerms(node.children, result);
    } else if (node.isLeaf && node.perms) {
      result.push({ key: node.key, perms: node.perms });
    }
  }
  return result;
}

export function countCheckedInNode(node, checkedSet) {
  let total = 0;
  if (node.children) {
    for (const child of node.children) {
      total += countCheckedInNode(child, checkedSet);
    }
  } else if (node.isLeaf && checkedSet.has(node.key)) {
    total = 1;
  }
  return total;
}

export function countTotalInNode(node) {
  let total = 0;
  if (node.children) {
    for (const child of node.children) {
      total += countTotalInNode(child);
    }
  } else if (node.isLeaf) {
    total = 1;
  }
  return total;
}

export function checkedKeysToPerms(checkedKeys, leafPerms) {
  const checkedSet = new Set(checkedKeys);
  const perms = {};

  for (const leaf of leafPerms) {
    if (!checkedSet.has(leaf.key)) continue;
    const parsed = parsePerms(leaf.perms);
    if (!parsed) continue;

    if (!perms[parsed.module]) perms[parsed.module] = {};
    if (!perms[parsed.module][parsed.page]) perms[parsed.module][parsed.page] = [];

    if (!perms[parsed.module][parsed.page].includes(parsed.perm)) {
      perms[parsed.module][parsed.page].push(parsed.perm);
    }
  }

  return perms;
}

export function permsToCheckedKeys(page_perms, leafPerms) {
  const checkedKeys = [];
  const grantedCodes = new Set();

  for (const [mod, pages] of Object.entries(page_perms || {})) {
    for (const [page, permList] of Object.entries(pages || {})) {
      for (const perm of permList) {
        grantedCodes.add(`${mod}.${page}.${perm}`);
      }
    }
  }

  for (const leaf of leafPerms) {
    const parsed = parsePerms(leaf.perms);
    if (!parsed) continue;
    const code = `${parsed.module}.${parsed.page}.${parsed.perm}`;
    if (grantedCodes.has(code)) {
      checkedKeys.push(leaf.key);
    }
  }

  return checkedKeys;
}
