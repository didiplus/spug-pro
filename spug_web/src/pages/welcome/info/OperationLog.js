import React, { useEffect } from 'react';
import ComTable from '../../system/operotionlog/Table';
import logStore from '../../system/operotionlog/store';
import store from './store';

export default function OperationLog() {
  useEffect(() => {
    logStore.f_name = store.user.username || '';
    logStore.current = 1;
    return () => { logStore.f_name = ''; };
  }, [store.user.username]);

  return <ComTable/>;
}
