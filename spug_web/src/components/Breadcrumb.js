import React from 'react';
import { Breadcrumb } from 'antd';
import styles from './index.module.less';


export default class extends React.Component {

  render() {
    const items = this.props.items?.map(item =>
      typeof item === 'string' ? {title: item} : item
    );
    let title = this.props.title;
    if (!title && items) {
      const lastItem = items[items.length - 1];
      title = lastItem.title;
    }

    return (
      <div className={styles.breadcrumb}>
        <Breadcrumb items={items} />
        {this.props.extra ? (
          <div className={styles.title}>
            {this.props.extra}
          </div>
        ) : null}
      </div>
    )
  }
}
