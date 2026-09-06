import { createRoot } from 'react-dom/client';
import { assertLocalQaRuntime } from './localQaRuntime';

const root = createRoot(document.getElementById('root')!);
async function start() {
  try {
    assertLocalQaRuntime();
    const { Keep04QaHarness } = await import('./Keep04QaHarness');
    root.render(<Keep04QaHarness />);
  } catch { root.render(<main role="alert">Keep 0.4 QA is available only through a loopback development server.</main>); }
}
void start();
