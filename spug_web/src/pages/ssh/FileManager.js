/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { message } from 'libs/message';
import { Table, Switch, Progress, Modal, Input, Tooltip, Flex } from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  FileOutlined,
  FolderOutlined,
  HomeOutlined,
  UploadOutlined,
  EditOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { AuthButton, Action } from 'components';
import { http, uniqueId, X_TOKEN } from 'libs';
import lds from 'lodash';
import styles from './index.module.less';
import moment from 'moment';

export default function FileManager({ id }) {
  const [fetching, setFetching] = useState(false);
  const [showDot, setShowDot] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('active');
  const [percent, setPercent] = useState(0);
  const [pwd, setPwd] = useState([]);
  const [objects, setObjects] = useState([]);
  const [editing, setEditing] = useState(false);
  const [inputPath, setInputPath] = useState('');

  const fileInputRef = useRef(null);
  const pwdHistoryRef = useRef(new Map());
  const socketRef = useRef(null);
  const uploadTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const blurTimerRef = useRef(null);

  const fetchFiles = useCallback((nextPwd) => {
    if (!mountedRef.current) return Promise.resolve();
    setFetching(true);
    const p = nextPwd !== undefined ? nextPwd : pwd;
    const path = '/' + p.join('/');
    return http
      .get('/api/file/', { params: { id, path } })
      .then((res) => {
        if (!mountedRef.current) return;
        const sorted = lds.orderBy(res, [(item) => item.kind === 'd', 'name'], ['desc', 'asc']);
        setObjects(sorted);
        setPwd(p);
        pwdHistoryRef.current.set(id, p);
      })
      .finally(() => {
        if (mountedRef.current) setFetching(false);
      });
  }, [id, pwd]);

  useEffect(() => {
    mountedRef.current = true;
    fetchFiles();
    return () => {
      mountedRef.current = false;
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (uploadTimerRef.current) {
        clearTimeout(uploadTimerRef.current);
      }
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (id !== undefined) {
      const cached = pwdHistoryRef.current.get(id) || [];
      setPwd(cached);
      setObjects([]);
      fetchFiles(cached);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleChdir = useCallback((name, action) => {
    let nextPwd;
    if (action === '1') {
      nextPwd = [...pwd, name];
    } else if (action === '2') {
      const idx = pwd.indexOf(name);
      nextPwd = pwd.slice(0, idx + 1);
    } else {
      nextPwd = [];
    }
    setEditing(false);
    fetchFiles(nextPwd);
  }, [pwd, fetchFiles]);

  const handleStartEdit = useCallback(() => {
    setInputPath('/' + pwd.join('/'));
    setEditing(true);
  }, [pwd]);

  const handleInputConfirm = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    const raw = inputPath || '';
    const pwdStr = raw.replace(/^\/+|\/+$/g, '');
    const pwdArray = pwdStr ? pwdStr.split('/') : [];
    setEditing(false);
    fetchFiles(pwdArray).catch(() => {
      message.error('路径不存在或无权访问');
    });
  }, [inputPath, fetchFiles]);

  const handleInputBlur = useCallback(() => {
    blurTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setEditing(false);
    }, 200);
  }, []);

  const updatePercentWS = useCallback((token) => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/ws/subscribe/${token}/?x-token=${X_TOKEN}`
    );
    socketRef.current = ws;
    ws.onopen = () => ws.send('ok');
    ws.onmessage = (e) => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      if (e.data === 'pong') {
        ws.send('ping');
      } else {
        setPercent((prev) => {
          const next = prev + Number(e.data) / 2;
          if (next >= 100) {
            ws.close();
            socketRef.current = null;
          }
          return next > prev ? Number(next.toFixed(1)) : prev;
        });
      }
    };
  }, []);

  const handleUpload = useCallback(() => {
    const el = fileInputRef.current;
    if (!el) return;
    el.click();
    el.onchange = (e) => {
      if (!mountedRef.current) return;
      const file = e.target.files[0];
      if (!file) return;
      setUploading(true);
      setUploadStatus('active');
      setPercent(0);
      const formData = new FormData();
      const token = uniqueId();
      updatePercentWS(token);
      formData.append('file', file);
      formData.append('id', id);
      formData.append('token', token);
      formData.append('path', '/' + pwd.join('/'));
      el.value = '';
      http
        .post('/api/file/object/', formData, {
          timeout: 600000,
          onUploadProgress: (ev) => {
            if (!mountedRef.current) return;
            const p = (ev.loaded / ev.total) * 100 / 2;
            setPercent(Number(p.toFixed(1)));
          },
        })
        .then(() => {
          if (!mountedRef.current) return;
          setUploadStatus('success');
          fetchFiles();
        })
        .catch(() => {
          if (!mountedRef.current) return;
          setUploadStatus('exception');
        })
        .finally(() => {
          if (mountedRef.current) {
            uploadTimerRef.current = setTimeout(() => {
              if (mountedRef.current) setUploading(false);
              uploadTimerRef.current = null;
            }, 2000);
          }
        });
    };
  }, [id, pwd, fetchFiles, updatePercentWS]);


  const handleDownload = useCallback((name) => {
    const file = `/${pwd.join('/')}/${name}`;
    const link = document.createElement('a');
    link.download = name;
    link.href = `/api/file/object/?id=${id}&file=${file}&x-token=${X_TOKEN}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.warning('即将开始下载，请勿重复点击。');
  }, [id, pwd]);

  const handleDelete = useCallback((name) => {
    const file = `/${pwd.join('/')}/${name}`;
    Modal.confirm({
      title: '删除文件确认',
      content: `确认删除文件：${file} ?`,
      onOk: () => {
        return http
          .delete('/api/file/object/', { params: { id, file } })
          .then(() => {
            if (!mountedRef.current) return;
            message.success('删除成功');
            fetchFiles();
          });
      },
    });
  }, [id, pwd, fetchFiles]);

  const columns = [
    {
      title: '名称',
      key: 'name',
      render: (info) =>
        info.kind === 'd' ? (
          <div onClick={() => handleChdir(info.name, '1')} style={{ cursor: 'pointer' }}>
            <FolderOutlined style={{ color: info.is_link ? '#008b8b' : '#2563fc' }} />
            <span style={{ color: info.is_link ? '#008b8b' : '#2563fc', paddingLeft: 5 }}>
              {info.name}
            </span>
          </div>
        ) : (
          <React.Fragment>
            <FileOutlined />
            <span style={{ paddingLeft: 5 }}>{info.name}</span>
          </React.Fragment>
        ),
      ellipsis: true,
    },
    { title: '大小', dataIndex: 'size', align: 'right', className: styles.fileSize, width: 90 },
    {
      title: '修改时间',
      dataIndex: 'date',
      sorter: (a, b) => moment(a.date).unix() - moment(b.date).unix(),
      width: 190,
    },
    { title: '属性', dataIndex: 'code', width: 110 },
    {
      title: '操作',
      width: 100,
      align: 'right',
      key: 'action',
      render: (info) =>
        info.kind === '-' ? (
          <Action>
            <Action.Button
              className={styles.drawerBtn}
              icon={<DownloadOutlined />}
              onClick={() => handleDownload(info.name)}
            />
            <Action.Button
              danger
              auth="host.console.del"
              className={styles.drawerBtn}
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(info.name)}
            />
          </Action>
        ) : null,
    },
  ];

  let displayObjects = objects;
  if (!showDot) {
    displayObjects = objects.filter((x) => !x.name.startsWith('.'));
  }

  const scrollY = document.body.clientHeight - 168;

  return (
    <React.Fragment>
      <input style={{ display: 'none' }} type="file" ref={fileInputRef} />
      <div className={styles.drawerHeader}>
        <div className={styles.pathArea}>
          {editing ? (
            <Input
              autoFocus
              size="small"
              className={styles.input}
              suffix={<span style={{ color: '#999', fontSize: 12 }}>回车确认</span>}
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              onFocus={() => {
                if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
              }}
              onBlur={handleInputBlur}
              onPressEnter={handleInputConfirm}
            />
          ) : (
            <Flex align="center" gap={2} className={styles.breadWrap}>
              <Tooltip title="根目录">
                <HomeOutlined
                  className={styles.breadItem}
                  onClick={() => handleChdir('', '0')}
                />
              </Tooltip>
              {pwd.map((item, idx) => (
                <React.Fragment key={item + idx}>
                  <RightOutlined className={styles.breadSep} />
                  <span
                    className={styles.breadItem}
                    onClick={() => handleChdir(item, '2')}
                  >
                    {item}
                  </span>
                </React.Fragment>
              ))}
              <Tooltip title="编辑路径">
                <EditOutlined className={styles.edit} onClick={handleStartEdit} />
              </Tooltip>
            </Flex>
          )}
        </div>

        <div className={styles.action}>
          <span>显示隐藏文件：</span>
          <Switch
            checked={showDot}
            checkedChildren="开启"
            unCheckedChildren="关闭"
            onChange={setShowDot}
          />
          {uploading ? (
            <Progress
              className={styles.progress}
              strokeWidth={14}
              status={uploadStatus}
              percent={percent}
            />
          ) : (
            <AuthButton
              auth="host.console.upload"
              style={{ marginLeft: 12 }}
              size="small"
              type="primary"
              icon={<UploadOutlined />}
              onClick={handleUpload}
            >
              上传文件
            </AuthButton>
          )}
        </div>
      </div>
      <Table
        size="small"
        rowKey="name"
        loading={fetching}
        pagination={false}
        columns={columns}
        scroll={{ y: scrollY }}
        style={{
          fontFamily:
            'Source Code Pro, Courier New, Courier, Monaco, monospace, PingFang SC, Microsoft YaHei',
        }}
        dataSource={displayObjects}
      />
    </React.Fragment>
  );
}
