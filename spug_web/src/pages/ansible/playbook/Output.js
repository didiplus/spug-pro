import React from 'react';
import { observer } from 'mobx-react';
import TerminalOutput from 'components/TerminalOutput';
import S from './store';

function OutputView() {
  return <TerminalOutput runToken={S.runToken} title="执行详情" />;
}

export default observer(OutputView);
