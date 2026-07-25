import React from 'react';
import ReactDOM from 'react-dom/client';

import { assertLocalQaRuntime } from './localQaRuntime';
import '../styles/global.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

async function startDisposableFullstackQa() {
  try {
    assertLocalQaRuntime();
    if (
      window.location.protocol !== 'http:'
      || window.location.hostname !== '127.0.0.1'
    ) {
      throw new Error('Disposable full-stack QA requires exact numeric loopback.');
    }
    const { FullstackLocalQaApp } = await import('./FullstackLocalQaApp');
    root.render(
      <React.StrictMode>
        <FullstackLocalQaApp />
      </React.StrictMode>
    );
  } catch {
    root.render(
      <main role="alert">
        <h1>LOCAL FULL-STACK QA DISABLED</h1>
        <p>This development-only entry requires its runtime-owned loopback launcher.</p>
      </main>
    );
  }
}

void startDisposableFullstackQa();
