import React, { useState, useEffect, useMemo } from 'react';
import { Dropdown, Badge, Empty, Spin, Button } from 'antd';
import { notification } from 'libs/message';
import {
  NotificationOutlined,
  MonitorOutlined,
  FlagOutlined,
  ScheduleOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import { http, X_TOKEN } from 'libs';
import moment from 'moment';
import styles from './Notification.module.css';

let ws = { readyState: 3 };
let timer;

const ICON_MAP = {
  monitor: { icon: MonitorOutlined, cls: styles.iconMonitor, color: 'var(--color-primary)' },
  schedule: { icon: ScheduleOutlined, cls: styles.iconSchedule, color: 'var(--color-green-500)' },
  flag: { icon: FlagOutlined, cls: styles.iconFlag, color: 'var(--color-purple-500)' },
  alert: { icon: AlertOutlined, cls: styles.iconAlert, color: 'var(--color-red-500)' },
};

function NotifyIcon({ type }) {
  const cfg = ICON_MAP[type];
  if (!cfg) return null;
  const IconComp = cfg.icon;
  return (
    <div className={`${styles.iconWrap} ${cfg.cls}`}>
      <IconComp style={{ fontSize: 20, color: cfg.color }} />
    </div>
  );
}

export default function Notification() {
  const [loading, setLoading] = useState(false);
  const [notifies, setNotifies] = useState([]);
  const [reads, setReads] = useState([]);

  useEffect(() => {
    fetch();
    listen();
    timer = setInterval(() => {
      if (ws.readyState === 1) {
        ws.send('ping');
      } else if (ws.readyState === 3) {
        listen();
      }
    }, 10000);
    return () => {
      if (timer) clearInterval(timer);
      if (ws.close) ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fetch() {
    setLoading(true);
    http.get('/api/notify/')
      .then(res => {
        setReads(res.filter(x => !x.unread).map(x => x.id));
        setNotifies(res);
      })
      .finally(() => setLoading(false));
  }

  function listen() {
    if (!X_TOKEN) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/notify/?x-token=${X_TOKEN}`);
    ws.onopen = () => ws.send('ok');
    ws.onmessage = e => {
      if (e.data !== 'pong') {
        fetch();
        try {
          const { title, content } = JSON.parse(e.data);
          const key = `open${Date.now()}`;
          notification.warning({
            message: title,
            description: <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>,
            actions: [
              <Button
                key="close-btn"
                type="primary"
                size="small"
                onClick={() => notification.close(key)}
              >
                知道了
              </Button>,
            ],
            key,
            top: 64,
            duration: null,
          });
        } catch (err) {
          // ignore parse errors
        }
      }
    };
  }

  function handleVisible(visible) {
    if (visible) fetch();
  }

  function handleRead(e, item) {
    e.stopPropagation();
    if (reads.indexOf(item.id) === -1) {
      reads.push(item.id);
      setReads([...reads]);
      http.patch('/api/notify/', { ids: [item.id] });
    }
  }

  function handleReadAll() {
    const ids = notifies.map(x => x.id);
    setReads(ids);
    http.patch('/api/notify/', { ids });
  }

  const count = notifies.length - reads.length;
  const unreadCount = count > 0 ? count : 0;

  const panel = useMemo(() => (
    <div className={styles.panel} role="region" aria-label="消息通知">
      <div className={styles.header}>
        <span className={styles.headerTitle}>
          消息通知{unreadCount > 0 && `（${unreadCount} 条未读）`}
        </span>
        {notifies.length > 0 && unreadCount > 0 && (
          <span
            className={styles.markAll}
            onClick={handleReadAll}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleReadAll(); }}
          >
            全部已读
          </span>
        )}
      </div>
      <div className={styles.list}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <Spin />
          </div>
        ) : notifies.length === 0 ? (
          <div className={styles.empty}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无消息" />
          </div>
        ) : (
          notifies.map(item => {
            const isRead = reads.includes(item.id);
            return (
              <div
                key={item.id}
                className={`${styles.item} ${isRead ? styles.itemRead : styles.itemUnread}`}
                onClick={e => handleRead(e, item)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') handleRead(e, item); }}
              >
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                  <NotifyIcon type={item.source} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={styles.title}>{item.title}</div>
                    <div className={styles.content}>{item.content}</div>
                    <div className={styles.time}>{moment(item.created_at).fromNow()}</div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  ), [notifies, reads, loading, unreadCount]);

  return (
    <div>
      <Dropdown trigger={['click']} onOpenChange={handleVisible} popupRender={() => panel}>
        <div
          className={styles.trigger}
          role="button"
          aria-label={`消息通知${unreadCount > 0 ? `，${unreadCount} 条未读` : ''}`}
          tabIndex={0}
        >
          <Badge count={unreadCount} offset={[-2, 2]}>
            <NotificationOutlined style={{ fontSize: 16 }} />
          </Badge>
        </div>
      </Dropdown>
    </div>
  );
}
