import ReactDOM from 'react-dom/client';

import { assertLocalQaRuntime } from './localQaRuntime';
import {
  innerKeepQaRuntimeInstrumentation,
  type InnerKeepQaInstrumentation
} from './innerKeepQaInstrumentation';
import '../styles/global.css';
import './innerKeepQa.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

async function startInnerKeepQa() {
  let instrumentation: InnerKeepQaInstrumentation | undefined;
  try {
    assertLocalQaRuntime();
    instrumentation = innerKeepQaRuntimeInstrumentation();
    const [{ InnerKeepQaHarness }, { readInnerKeepQaScenario }] = await Promise.all([
      import('./InnerKeepQaHarness'),
      import('./innerKeepQaScenarioManifest.mjs')
    ]);
    root.render(
      <InnerKeepQaHarness scenario={readInnerKeepQaScenario(window.location.search)} />
    );
  } catch {
    instrumentation?.restore();
    root.render(
      <main className="inner-keep-qa__terminal" role="alert">
        <h1>Inner Keep QA unavailable</h1>
        <p>This page opens only through an exact loopback Vite development URL.</p>
      </main>
    );
  }
}

void startInnerKeepQa();
