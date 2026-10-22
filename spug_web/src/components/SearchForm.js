/**
 * Copyright (c) OpenSpug Organization. https://github.com/openspug/spug
 * Copyright (c) <spug.dev@gmail.com>
 * Released under the AGPL-3.0 License.
 */
import React from 'react';
import { Row, Col, Form } from 'antd';
import styles from './index.module.less';

function SearchForm(props) {
  const { children, style, compact, ...rest } = props;
  const className = compact ? `${styles.searchForm} ${styles.compact}` : styles.searchForm;
  return (
    <div className={className} style={style}>
      <Form labelCol={{flex: '0 0 auto'}} wrapperCol={{flex: '1 1 0'}} {...rest}>
        <Row gutter={{md: 8, lg: 24, xl: 48}}>
          {children}
        </Row>
      </Form>
    </div>
  );
}

SearchForm.Item = function Item({span = 8, offset, style, title, label, children}) {
  return (
    <Col span={span} offset={offset} style={style}>
      <Form.Item label={title ?? label}>
        {children}
      </Form.Item>
    </Col>
  );
};

export default SearchForm;
