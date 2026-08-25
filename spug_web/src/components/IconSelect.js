import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Input, Flex, Typography, Empty, Spin } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

const { Text } = Typography;

const PAGE_SIZE = 36;

let _allIcons = null;
function loadAllIcons() {
  if (_allIcons) return Promise.resolve(_allIcons);
  return import('@ant-design/icons').then(module => {
    _allIcons = Object.entries(module)
      .filter(([name, comp]) => name.endsWith('Outlined') && typeof comp === 'object' && comp !== null)
      .map(([name, comp]) => ({ name, el: React.createElement(comp) }));
    return _allIcons;
  });
}

export function IconByName({ name, style }) {
  const [el, setEl] = useState(null);
  useEffect(() => {
    if (!name) return;
    loadAllIcons().then(icons => {
      const found = icons.find(i => i.name === name);
      if (found) setEl(found.el);
    });
  }, [name]);
  if (!el) return null;
  return style ? React.cloneElement(el, { style }) : el;
}

export default function IconSelect({ value, onChange, allowClear = true, placeholder = '选择图标' }) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [icons, setIcons] = useState(null);
  const [page, setPage] = useState(1);
  const containerRef = useRef(null);

  useEffect(() => {
    if (open && !icons) {
      loadAllIcons().then(setIcons);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setKeyword('');
      setPage(1);
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const filteredIcons = useMemo(() => {
    if (!icons) return [];
    if (!keyword) return icons;
    const kw = keyword.toLowerCase();
    return icons.filter(item => item.name.toLowerCase().includes(kw));
  }, [icons, keyword]);

  const pagedIcons = useMemo(() => {
    return filteredIcons.slice(0, page * PAGE_SIZE);
  }, [filteredIcons, page]);

  const selectedIcon = useMemo(() => {
    if (!icons || !value) return null;
    return icons.find(i => i.name === value);
  }, [icons, value]);

  function handleSelect(iconName) {
    if (onChange) onChange(iconName);
    setOpen(false);
  }

  function handleClear(e) {
    e.stopPropagation();
    if (onChange) onChange(undefined);
  }

  function handleScroll(e) {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop - clientHeight < 50 && pagedIcons.length < filteredIcons.length) {
      setPage(p => p + 1);
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          minHeight: 32,
          padding: '4px 11px',
          border: `1px solid ${open ? '#409eff' : '#d9d9d9'}`,
          borderRadius: 6,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#fff',
          transition: 'border-color 0.2s',
        }}
      >
        <Flex align="center" gap={8}>
          {selectedIcon ? (
            <>
              <span style={{ fontSize: 16, color: '#2563fc', display: 'flex', alignItems: 'center' }}>
                {selectedIcon.el}
              </span>
              <Text style={{ fontSize: 13 }}>{selectedIcon.name}</Text>
            </>
          ) : (
            <Text type="secondary" style={{ fontSize: 13 }}>{placeholder}</Text>
          )}
        </Flex>
        {allowClear && value && (
          <span
            onClick={handleClear}
            style={{ color: '#bfbfbf', fontSize: 14, padding: '0 4px', lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </span>
        )}
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 1050,
            background: '#fff',
            border: '1px solid #d9d9d9',
            borderRadius: 6,
            boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
            padding: 12,
            maxHeight: 340,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Input
            allowClear
            placeholder="请输入图标名称"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }}/>}
            style={{ marginBottom: 12 }}
            value={keyword}
            onChange={e => { setKeyword(e.target.value); setPage(1); }}
          />
          <div
            onScroll={handleScroll}
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              alignContent: 'start',
            }}
          >
            {!icons ? (
              <div style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'center', padding: 40 }}>
                <Spin />
              </div>
            ) : pagedIcons.length === 0 ? (
              <div style={{ gridColumn: 'span 3' }}>
                <Empty image={Empty.PresentedImageNoData} description="未找到图标" />
              </div>
            ) : (
              pagedIcons.map(item => (
                <div
                  key={item.name}
                  onClick={() => handleSelect(item.name)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '10px 4px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    border: `1px solid ${value === item.name ? '#409eff' : 'transparent'}`,
                    background: value === item.name ? '#e6f4ff' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (value !== item.name) e.currentTarget.style.background = '#f5f5f5';
                  }}
                  onMouseLeave={e => {
                    if (value !== item.name) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{ fontSize: 20, color: value === item.name ? '#409eff' : '#606266', display: 'flex' }}>
                    {item.el}
                  </span>
                  <Text
                    style={{
                      fontSize: 11,
                      color: value === item.name ? '#409eff' : '#8c8c8c',
                      textAlign: 'center',
                      wordBreak: 'break-all',
                      lineHeight: '14px',
                    }}
                  >
                    {item.name}
                  </Text>
                </div>
              ))
            )}
          </div>
          <Flex justify="end" style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {icons ? `${pagedIcons.length} / ${filteredIcons.length} 个图标` : '加载中...'}
            </Text>
          </Flex>
        </div>
      )}
    </div>
  );
}
