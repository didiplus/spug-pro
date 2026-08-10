import { http } from 'libs';

let cachedMenus = null;
let fetchingPromise = null;

export function fetchMenus() {
  if (cachedMenus) return Promise.resolve(cachedMenus);
  if (fetchingPromise) return fetchingPromise;
  fetchingPromise = http.get('/api/setting/menus/').then(res => {
    cachedMenus = res;
    fetchingPromise = null;
    return res;
  }).catch(() => {
    fetchingPromise = null;
    return [];
  });
  return fetchingPromise;
}

export function clearMenuCache() {
  cachedMenus = null;
}