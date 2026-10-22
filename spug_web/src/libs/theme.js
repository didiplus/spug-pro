const STORAGE_KEY = 'spug-theme';
const VALID_THEMES = ['light', 'dark'];

export function getTheme() {
  return localStorage.getItem(STORAGE_KEY) || getSystemTheme();
}

export function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme) {
  if (!VALID_THEMES.includes(theme)) return;
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent('theme-change', { detail: theme }));
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function initTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && VALID_THEMES.includes(stored)) {
    applyTheme(stored);
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      applyTheme(e.matches ? 'dark' : 'light');
      window.dispatchEvent(new CustomEvent('theme-change', { detail: e.matches ? 'dark' : 'light' }));
    }
  });
}