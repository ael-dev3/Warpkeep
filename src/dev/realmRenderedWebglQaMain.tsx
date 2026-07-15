import React from 'react';
import ReactDOM from 'react-dom/client';

import { assertLocalQaRuntime } from './localQaRuntime';
import '../styles/global.css';
import './renderedWebglQa.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

async function startRenderedWebglQa() {
  try {
    assertLocalQaRuntime();
    const [{ RenderedWebglQaHarness }, { readRenderedWebglQaOptions }] = await Promise.all([
      import('./RenderedWebglQaHarness'),
      import('./renderedWebglQa')
    ]);
    const options = readRenderedWebglQaOptions(window.location.search);
    root.render(
      <React.StrictMode>
        <RenderedWebglQaHarness
          presentationMode={options.presentationMode}
          quality={options.quality}
        />
      </React.StrictMode>
    );
  } catch {
    root.render(
      <main className="rendered-webgl-qa__terminal" role="alert">
        <h1>Rendered QA unavailable</h1>
        <p>This page opens only through an exact loopback Vite development URL.</p>
      </main>
    );
  }
}

void startRenderedWebglQa();
