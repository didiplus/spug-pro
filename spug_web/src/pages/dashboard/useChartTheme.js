/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import { useState, useEffect } from 'react';

const DEFAULTS = {
  line: '#1677ff',
  axis: '#8c8c8c',
  grid: '#f0f0f0',
  tick: '#d9d9d9',
  tooltipBg: '#ffffff',
  tooltipText: '#262626',
  tooltipShadow: '0 2px 8px rgba(0,0,0,0.15)',
};

const KEYS = [
  ['line', '--chart-line-color'],
  ['axis', '--chart-axis-color'],
  ['grid', '--chart-grid-color'],
  ['tick', '--chart-tick-color'],
  ['tooltipBg', '--chart-tooltip-bg'],
  ['tooltipText', '--chart-tooltip-text'],
  ['tooltipShadow', '--chart-tooltip-shadow'],
];

export default function useChartTheme() {
  const [colors, setColors] = useState(DEFAULTS);

  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const next = { ...DEFAULTS };
      for (const [key, token] of KEYS) {
        const value = style.getPropertyValue(token).trim();
        if (value) next[key] = value;
      }
      setColors(next);
    };
    read();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) {
      mq.addEventListener('change', read);
      return () => mq.removeEventListener('change', read);
    }
    mq.addListener(read);
    return () => mq.removeListener(read);
  }, []);

  return colors;
}