import React from 'react';
import ReactDOM from 'react-dom/client';

import { RealmQaHarness } from './RealmQaHarness';
import '../styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RealmQaHarness />
  </React.StrictMode>
);
