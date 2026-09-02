import React, { useState, useEffect } from 'react';
import { message } from 'libs/message';
import { Drawer, Form, Button, Select, Row, Col, Card, } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import themes from './themes';
import gStore from 'gStore';
import css from './setting.module.less';

const fontSizeOptions = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24];

const fontFamilyOptions = [
  { value: 'Courier', label: 'Courier' },
  { value: 'Consolas', label: 'Consolas' },
  { value: 'DejaVu Sans Mono', label: 'DejaVu Sans Mono' },
  { value: 'Droid Sans Mono', label: 'Droid Sans Mono' },
  { value: 'Monaco', label: 'Monaco' },
  { value: 'Menlo', label: 'Menlo' },
  { value: 'monospace', label: 'monospace' },
  { value: 'Source Code Pro', label: 'Source Code Pro' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono' },
  { value: 'Fira Code', label: 'Fira Code' },
  { value: 'Cascadia Code', label: 'Cascadia Code' },
];

function Setting(props) {
  const [theme, setTheme] = useState('dark');
  const [styles, setStyles] = useState(themes['dark']);
  const [fontSize, setFontSize] = useState(14);
  const [fontFamily, setFontFamily] = useState('Courier');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { theme, styles, fontSize, fontFamily } = gStore.terminal;
    setTheme(theme);
    setStyles(styles);
    setFontSize(fontSize);
    setFontFamily(fontFamily);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gStore.terminal]);

  useEffect(() => {
    if (themes[theme]) {
      setStyles(themes[theme]);
    }
  }, [theme]);

  function handleSubmit() {
    setLoading(true);
    const data = { fontSize, fontFamily, theme };
    gStore.updateUserSettings('terminal', JSON.stringify(data))
      .then(() => {
        message.success('已保存');
        props.onClose();
      })
      .finally(() => setLoading(false));
  }

  return (
    <Drawer
      title="终端设置"
      placement="right"
      width={380}
      open={props.visible}
      onClose={props.onClose}
    >
      <Form layout="vertical">
        <Form.Item label="字体大小">
          <Select
            value={fontSize}
            onChange={(v) => setFontSize(v)}
            options={fontSizeOptions.map((v) => ({ value: v, label: `${v}px` }))}
          />
        </Form.Item>
        <Form.Item label="字体名称">
          <Select
            value={fontFamily}
            onChange={(v) => setFontFamily(v)}
            options={fontFamilyOptions}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item label="主题配色">
          <Row gutter={[8, 8]}>
            {Object.entries(themes).map(([key, item]) => (
              <Col key={key} span={8}>
                <Card
                  hoverable
                  size="small"
                  className={css.themeCard}
                  style={{ background: item.background, borderColor: theme === key ? 'var(--color-primary)' : 'transparent' }}
                  onClick={() => setTheme(key)}
                  styles={{ body: { padding: '6px 8px' } }}
                >
                  <div style={{ color: item.foreground, fontSize: 11, fontWeight: 500 }}>
                    {item.name || key}
                  </div>
                  <div style={{ marginTop: 4, display: 'flex', gap: 3 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.red, display: 'inline-block' }} />
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.green, display: 'inline-block' }} />
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.yellow, display: 'inline-block' }} />
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.blue, display: 'inline-block' }} />
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.cyan, display: 'inline-block' }} />
                  </div>
                  {theme === key && (
                    <CheckOutlined style={{ position: 'absolute', top: 6, right: 8, color: 'var(--color-primary)', fontSize: 14 }} />
                  )}
                </Card>
              </Col>
            ))}
          </Row>
        </Form.Item>
        <Form.Item label="预览">
          <div
            className={css.preview}
            style={{ fontSize, fontFamily, background: styles.background, color: styles.foreground }}
          >
            <div>Welcome to Spug !</div>
            <div>* Website: https://spug.cc</div>
            <div>[root@iZ8vb48roZ ~]# ls</div>
            <div>
              <span style={{ color: styles.brightBlue }}>apps </span>
              <span style={{ color: styles.brightRed }}>bak.tar.gz </span>
              <span style={{ color: styles.brightGreen }}>manage.py </span>
              <span>README.md</span>
            </div>
            <div>[root@iZ8vb48roZ ~]# pwd</div>
            <div>/data/api</div>
            <div>[root@iZ8vb48roZ ~]#</div>
          </div>
        </Form.Item>
        <Button block type="primary" className={css.btn} loading={loading} onClick={handleSubmit}>
          保存
        </Button>
      </Form>
    </Drawer>
  );
}

export default Setting;
