import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Slider, Typography, Spin, message, Tag } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, FullscreenOutlined, FullscreenExitOutlined, ReloadOutlined } from '@ant-design/icons';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { http, X_TOKEN } from 'libs';
import store from './store';
import styles from './Replay.module.css';
import 'xterm/css/xterm.css';

const { Text } = Typography;

const TERM_THEME = {
  background: '#0c0c0c',
  foreground: '#e0e0e0',
  cursor: '#e0e0e0',
  selectionBackground: 'rgba(255, 255, 255, 0.15)',
  black: '#000000', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
  blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
  brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379',
  brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
  brightCyan: '#56b6c2', brightWhite: '#ffffff',
};

const SPEEDS = [1, 2, 4, 8];

export default function Replay() {
  const wrapRef = useRef();
  const containerRef = useRef();
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const eventsRef = useRef([]);
  const playIndexRef = useRef(0);
  const playTimerRef = useRef(null);
  const startTimeRef = useRef(0);
  const pausedAtRef = useRef(0);
  const speedRef = useRef(1);

  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => { speedRef.current = speed; }, [speed]);

  useEffect(() => {
    const term = new Terminal({fontSize: 14, fontFamily: '"Cascadia Code", "Fira Code", "Courier New", monospace', lineHeight: 1.2});
    const fitPlugin = new FitAddon();
    term.loadAddon(fitPlugin);
    term.options.theme = TERM_THEME;
    term.options.cursorBlink = false;
    term.open(containerRef.current);
    termRef.current = term;
    fitRef.current = fitPlugin;

    const doFit = () => {
      if (!containerRef.current || !fitRef.current) return;
      const {clientWidth, clientHeight} = containerRef.current;
      if (clientWidth > 0 && clientHeight > 0) fitRef.current.fit();
    };

    resizeObserverRef.current = new ResizeObserver(() => doFit());
    resizeObserverRef.current.observe(containerRef.current);
    requestAnimationFrame(() => doFit());

    loadRecording();

    const handleKey = (e) => {
      if (e.code === 'Space' && !e.target.matches('input, textarea, select, button')) {
        e.preventDefault();
        togglePlay();
      }
    };
    document.addEventListener('keydown', handleKey);
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      requestAnimationFrame(() => doFit());
    };
    document.addEventListener('fullscreenchange', handleFsChange);

    return () => {
      stop();
      if (resizeObserverRef.current) { resizeObserverRef.current.disconnect(); resizeObserverRef.current = null; }
      if (termRef.current) termRef.current.dispose();
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadRecording() {
    setLoading(true);
    http.get(`/api/host/ssh/sessions/${store.replayToken}/`)
      .then(info => {
        setSessionInfo(info);
        return fetch(`/api/host/ssh/sessions/${store.replayToken}/recording/`, {
          headers: { 'X-Token': X_TOKEN }
        }).then(res => res.text());
      })
      .then(text => {
        const lines = text.trim().split('\n');
        if (lines.length < 2) {
          message.error('录制文件为空');
          setLoading(false);
          return;
        }
        const header = JSON.parse(lines[0]);
        termRef.current.resize(header.width || 80, header.height || 24);
        termRef.current.write('\x1b[2J\x1b[3J\x1b[1;1H');
        requestAnimationFrame(() => { if (fitRef.current) fitRef.current.fit(); });
        const events = [];
        for (let i = 1; i < lines.length; i++) {
          try {
            const [ts, type, data] = JSON.parse(lines[i]);
            if (type === 'o') events.push({ts, data});
          } catch {}
        }
        eventsRef.current = events;
        setTotalTime(events.length > 0 ? events[events.length - 1].ts : 0);
        setLoading(false);
        play();
      })
      .catch(() => { message.error('加载录制文件失败'); setLoading(false); });
  }

  function play() {
    if (eventsRef.current.length === 0) return;
    const events = eventsRef.current;
    const offset = playIndexRef.current > 0 ? events[playIndexRef.current - 1].ts : 0;
    const spd = speedRef.current;
    startTimeRef.current = Date.now() - (pausedAtRef.current - offset) * 1000 / spd;
    setPlaying(true);
    playTimerRef.current = setInterval(() => {
      const s = speedRef.current;
      const elapsed = (Date.now() - startTimeRef.current) * s / 1000;
      let idx = playIndexRef.current;
      while (idx < events.length && events[idx].ts <= elapsed + offset) {
        termRef.current.write(events[idx].data);
        idx++;
      }
      playIndexRef.current = idx;
      setCurrentTime(elapsed + offset);
      if (idx >= events.length) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
        setPlaying(false);
        setCurrentTime(totalTime);
      }
    }, 16);
  }

  function pause() {
    if (playTimerRef.current) { clearInterval(playTimerRef.current); playTimerRef.current = null; }
    pausedAtRef.current = currentTime;
    setPlaying(false);
  }

  function stop() {
    if (playTimerRef.current) { clearInterval(playTimerRef.current); playTimerRef.current = null; }
    setPlaying(false);
  }

  function togglePlay() {
    if (loading) return;
    if (playing) { pause(); return; }
    if (playIndexRef.current >= eventsRef.current.length) { replayFromStart(); return; }
    play();
  }

  function replayFromStart() {
    stop();
    playIndexRef.current = 0;
    pausedAtRef.current = 0;
    setCurrentTime(0);
    if (termRef.current) termRef.current.write('\x1b[2J\x1b[3J\x1b[1;1H');
    play();
  }

  function handleSeek(value) {
    stop();
    const events = eventsRef.current;
    if (termRef.current) termRef.current.write('\x1b[2J\x1b[3J\x1b[1;1H');
    let idx = 0;
    while (idx < events.length && events[idx].ts <= value) {
      termRef.current.write(events[idx].data);
      idx++;
    }
    playIndexRef.current = idx;
    pausedAtRef.current = value;
    setCurrentTime(value);
  }

  function handleSpeedChange(value) {
    const wasPlaying = playing;
    if (wasPlaying) pause();
    setSpeed(value);
    speedRef.current = value;
    if (wasPlaying) play();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (wrapRef.current?.requestFullscreen) {
      wrapRef.current.requestFullscreen();
    }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <Modal
      visible
      width={960}
      footer={null}
      title="SSH 会话回放"
      onCancel={store.closeReplay}
      destroyOnClose
      bodyStyle={{paddingBottom: 24}}>
      {sessionInfo && (
        <div className={styles.infoBar}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>主机</span>
            <Text strong>{sessionInfo.host_name}</Text>
            <Text type="secondary" code style={{fontSize: 12}}>{sessionInfo.host_hostname}</Text>
          </div>
          <div className={styles.infoDivider}/>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>用户</span>
            <Text strong>{sessionInfo.user_name}</Text>
          </div>
          <div className={styles.infoDivider}/>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>来源</span>
            <Text code style={{fontSize: 12}}>{sessionInfo.client_ip || '-'}</Text>
          </div>
          <div className={styles.infoDivider}/>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>时间</span>
            <Text>{sessionInfo.start_time}</Text>
          </div>
          {sessionInfo.duration > 0 && (
            <>
              <div className={styles.infoDivider}/>
              <Tag color="blue" style={{margin: 0}}>{formatTime(sessionInfo.duration)}</Tag>
            </>
          )}
        </div>
      )}
      <div className={styles.terminalWrap} ref={wrapRef}>
        <div className={styles.terminalHeader}>
          <span className={`${styles.terminalDot} ${styles.terminalDotRed}`}/>
          <span className={`${styles.terminalDot} ${styles.terminalDotYellow}`}/>
          <span className={`${styles.terminalDot} ${styles.terminalDotGreen}`}/>
          <span className={styles.terminalTitle}>
            {sessionInfo ? `${sessionInfo.user_name}@${sessionInfo.host_name}` : 'terminal'}
          </span>
        </div>
        {loading && (
          <div className={styles.loadingOverlay}>
            <Spin tip="加载录制文件..." size="large"/>
          </div>
        )}
        <div ref={containerRef} className={styles.terminalInner}/>
      </div>
      <div className={styles.controls}>
        <Button
          className={styles.playBtn}
          type="primary"
          shape="circle"
          size="large"
          icon={playing ? <PauseCircleOutlined/> : <PlayCircleOutlined/>}
          onClick={togglePlay}
          disabled={loading}/>
        <Text className={styles.timeLabel}>{formatTime(currentTime)}</Text>
        <Slider
          className={styles.progressSlider}
          min={0}
          max={totalTime || 1}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          tooltip={{formatter: v => formatTime(v)}}/>
        <Text className={`${styles.timeLabel} ${styles.timeLabelEnd}`}>{formatTime(totalTime)}</Text>
        <div className={styles.controlGroup}>
          {SPEEDS.map(s => (
            <button
              key={s}
              className={`${styles.speedBtn} ${speed === s ? styles.speedBtnActive : ''}`}
              onClick={() => handleSpeedChange(s)}>
              {s}x
            </button>
          ))}
        </div>
        <button className={styles.iconBtn} onClick={replayFromStart} title="重新播放" disabled={loading}>
          <ReloadOutlined/>
        </button>
 
      </div>
    </Modal>
  );
}
