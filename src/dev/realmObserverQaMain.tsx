import React from 'react';
import ReactDOM from 'react-dom/client';

import { RealmObserverQaHarness } from './RealmObserverQaHarness';
import '../styles/global.css';
import './realmObserverQa.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RealmObserverQaHarness />
  </React.StrictMode>
);
