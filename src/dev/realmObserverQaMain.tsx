import React from 'react';
import ReactDOM from 'react-dom/client';

import { assertLocalQaRuntime } from './localQaRuntime';
import '../styles/global.css';
import './realmObserverQa.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

async function startLocalObserver() {
  try {
    assertLocalQaRuntime();
    const { RealmObserverQaHarness } = await import('./RealmObserverQaHarness');
    root.render(
      <React.StrictMode>
        <RealmObserverQaHarness />
      </React.StrictMode>
    );
  } catch {
    root.render(
      <main className="realm-observer-qa-status" role="alert">
        <section>
          <p>LOCAL QA DISABLED</p>
          <h1>Observer unavailable</h1>
          <span>This page opens only through an exact loopback Vite development URL.</span>
        </section>
      </main>
    );
  }
}

void startLocalObserver();
