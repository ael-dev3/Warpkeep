import React from 'react';
import ReactDOM from 'react-dom/client';

import { assertLocalQaRuntime } from './localQaRuntime';
import '../styles/global.css';
import './qaJourney.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

async function startLocalJourneyLab() {
  try {
    assertLocalQaRuntime();
    const [{ WarpkeepQaJourneyLab }, { readQaJourneyOptions }] = await Promise.all([
      import('./WarpkeepQaJourneyLab'),
      import('./qaJourneyFixture')
    ]);
    const options = readQaJourneyOptions(window.location.search);
    root.render(
      <React.StrictMode>
        <WarpkeepQaJourneyLab
          autoCycleIntervalMs={options.intervalMs}
          initialAutoCycle={options.autoCycle}
          initialScenario={options.scenario}
          syncLocation
        />
      </React.StrictMode>
    );
  } catch {
    root.render(
      <main className="qa-journey__disabled" role="alert">
        <section>
          <p>LOCAL QA DISABLED</p>
          <h1>Journey lab unavailable</h1>
          <span>This page opens only through an exact loopback Vite development URL.</span>
        </section>
      </main>
    );
  }
}

void startLocalJourneyLab();
