import { afterEach, expect, it, vi } from 'vitest';
import { collapseKeep04ProbeControls, keep04ProbePlan, readKeep04ProbeDom, runKeep04BrowserProbe, waitForKeep04ProbeObservation } from '../scripts/qa-observer/keep04-browser-probe.mjs';

vi.mock('../scripts/qa-observer/keep04-capture-output.mjs', () => ({
  createKeep04CaptureRun: vi.fn(),
  writeKeep04RunFile: vi.fn(async () => undefined),
}));

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });
const requested = () => keep04ProbePlan(['--base-url=http://127.0.0.1:4176']).cases[0];
function readyDom() {
  const entry = requested();
  vi.stubGlobal('location', { origin: 'http://127.0.0.1:4176', href: entry.url });
  vi.stubGlobal('innerWidth', entry.width); vi.stubGlobal('innerHeight', entry.height);
  const root = document.createElement('main'); Object.assign(root.dataset, { qaSynthetic: 'true', qaScenario: entry.scenario, qaQuality: entry.quality, qaFault: 'none', qaReducedMotion: 'false' });
  const host = document.createElement('section'); host.setAttribute('aria-label', 'Verdant Citadel scene'); host.dataset.mode = 'webgl';
  const keep = document.createElement('div'); keep.className = 'keep04'; keep.append(document.createElement('canvas')); host.append(keep);
  const output = document.createElement('output'); output.dataset.qaObservation = 'true'; output.dataset.lastObservation = JSON.stringify({ event: 'frame', timestampMs: 42, renderCalls: 10, renderTriangles: 20 });
  root.append(host, output); document.body.append(root);
  return { entry, root, host, output };
}

it('requires an actual rendered frame, exact scenario/profile/document and finite renderer counters', () => {
  const { entry, root, output } = readyDom();
  expect(readKeep04ProbeDom(entry)).toMatchObject({ mode: 'webgl', scenario: 'empty', quality: 'high', observation: { event: 'frame', renderCalls: 10 } });
  for (const event of ['loading', 'disposed', 'context-lost', 'fallback']) {
    output.dataset.lastObservation = JSON.stringify({ event, renderCalls: 10, renderTriangles: 20 });
    expect(readKeep04ProbeDom(entry)).toBeNull();
  }
  output.dataset.lastObservation = JSON.stringify({ event: 'frame', renderCalls: null, renderTriangles: 20 });
  expect(readKeep04ProbeDom(entry)).toBeNull();
  output.dataset.lastObservation = JSON.stringify({ event: 'frame', renderCalls: 10, renderTriangles: 20 });
  for (const [key, value] of [['qaScenario', 'mill-complete'], ['qaQuality', 'balanced'], ['qaFault', 'missing-model'], ['qaReducedMotion', 'true']]) {
    const previous = root.dataset[key]; root.dataset[key] = value; expect(readKeep04ProbeDom(entry)).toBeNull(); root.dataset[key] = previous;
  }
  vi.stubGlobal('innerWidth', 390); expect(readKeep04ProbeDom(entry)).toBeNull(); vi.stubGlobal('innerWidth', entry.width);
  vi.stubGlobal('location', { origin: 'http://127.0.0.1:4176', href: 'http://127.0.0.1:4176/dev/other.html' });
  expect(readKeep04ProbeDom(entry)).toBeNull();
});

it('accepts a matching terminal fallback, never a pending or previous frame observation', () => {
  const { entry, host, output } = readyDom(); host.dataset.mode = 'fallback'; host.querySelector('canvas')!.remove();
  expect(readKeep04ProbeDom(entry)).toBeNull();
  output.dataset.lastObservation = JSON.stringify({ event: 'loading', renderCalls: null, renderTriangles: null }); expect(readKeep04ProbeDom(entry)).toBeNull();
  output.dataset.lastObservation = JSON.stringify({ event: 'fallback', renderCalls: null, renderTriangles: null });
  expect(readKeep04ProbeDom(entry)).toMatchObject({ mode: 'fallback', canvasCount: 0, observation: { event: 'fallback' } });
});

it('collapses only the controls disclosure on the exact requested QA document', () => {
  const { entry, root } = readyDom();
  const controls = document.createElement('details'); controls.dataset.qaControls = 'true'; controls.open = true;
  const schematic = document.createElement('details'); schematic.open = true;
  root.append(controls, schematic);

  expect(collapseKeep04ProbeControls(entry)).toEqual({ controlsCollapsed: true });
  expect(controls.open).toBe(false);
  expect(schematic.open).toBe(true);

  controls.open = true;
  vi.stubGlobal('location', { origin: 'https://warpkeep.com', href: entry.url });
  expect(collapseKeep04ProbeControls(entry)).toBeNull();
  vi.stubGlobal('location', { origin: 'http://127.0.0.1:4176', href: `${entry.url}&stale=1` });
  expect(collapseKeep04ProbeControls(entry)).toBeNull();
  vi.stubGlobal('location', { origin: 'http://127.0.0.1:4176', href: entry.url });
  root.dataset.qaScenario = 'mill-complete';
  expect(collapseKeep04ProbeControls(entry)).toBeNull();
  expect(controls.open).toBe(true);
});

it('collapses QA controls before every synthetic screenshot and marks capture provenance', async () => {
  const cases = keep04ProbePlan(['--base-url=http://127.0.0.1:4176']).cases;
  const root = document.createElement('main'); root.dataset.qaSynthetic = 'true';
  const controls = document.createElement('details'); controls.dataset.qaControls = 'true';
  const host = document.createElement('section'); host.setAttribute('aria-label', 'Verdant Citadel scene'); host.dataset.mode = 'webgl';
  const keep = document.createElement('div'); keep.className = 'keep04'; keep.append(document.createElement('canvas')); host.append(keep);
  const output = document.createElement('output'); output.dataset.qaObservation = 'true';
  root.append(controls, host, output); document.body.append(root);

  let current: (typeof cases)[number] | undefined;
  let loader = 0;
  const calls: Array<{ method: string; expression?: string }> = [];
  const session = { command: async (method: string, parameters?: Record<string, unknown>) => {
    calls.push({ method, expression: typeof parameters?.expression === 'string' ? parameters.expression : undefined });
    if (method === 'Page.navigate') {
      current = cases.find(entry => entry.url === parameters!.url)!; loader++;
      vi.stubGlobal('location', { origin: 'http://127.0.0.1:4176', href: current.url });
      vi.stubGlobal('innerWidth', current.width); vi.stubGlobal('innerHeight', current.height);
      root.dataset.qaScenario = current.scenario; root.dataset.qaQuality = current.quality;
      root.dataset.qaFault = current.scenario === 'fallback' ? 'webgl-unavailable' : 'none';
      root.dataset.qaReducedMotion = String(current.scenario === 'reduced-motion');
      host.dataset.mode = current.scenario === 'fallback' ? 'fallback' : 'webgl';
      if (current.scenario === 'fallback') keep.replaceChildren(); else if (!keep.querySelector('canvas')) keep.append(document.createElement('canvas'));
      output.dataset.lastObservation = JSON.stringify(current.scenario === 'fallback'
        ? { event: 'fallback', renderCalls: null, renderTriangles: null }
        : { event: 'frame', renderCalls: 10, renderTriangles: 20 });
      return { frameId: 'main-frame', loaderId: `loader-${loader}` };
    }
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main-frame', loaderId: `loader-${loader}`, url: current!.url } } };
    if (method === 'Runtime.evaluate') {
      const expression = String(parameters!.expression);
      const value = expression.includes('controlsCollapsed')
        ? collapseKeep04ProbeControls(current!)
        : readKeep04ProbeDom(current!);
      return { result: { value } };
    }
    if (method === 'Page.captureScreenshot') return { data: Buffer.from('synthetic-png').toString('base64') };
    return undefined;
  } };

  const report = await runKeep04BrowserProbe(session, { id: 'test-run' });
  const captures = calls.flatMap((call, index) => call.method === 'Page.captureScreenshot' ? [index] : []);
  expect(captures).toHaveLength(cases.length);
  for (const capture of captures) {
    expect(calls[capture - 1]?.method).toBe('Runtime.evaluate');
    expect(calls[capture - 1]?.expression).toContain('controlsCollapsed');
  }
  expect(report.observations).toHaveLength(cases.length);
  expect(report.observations.every((observation: { captureControlsCollapsed?: boolean }) => observation.captureControlsCollapsed)).toBe(true);
});

it('polls through the previous document, stale scenario and pre-frame WebGL before returning capture readiness', async () => {
  const { entry, root, output } = readyDom();
  let checks = 0; let evaluations = 0;
  const session = { command: async (method: string, parameters?: Record<string, unknown>) => {
    if (method === 'Page.getFrameTree') {
      checks++;
      return { frameTree: { frame: { id: 'main-frame', loaderId: checks === 1 ? 'old-document' : 'requested-document', url: entry.url } } };
    }
    if (method !== 'Runtime.evaluate') throw new Error('Unexpected browser operation.');
    evaluations++;
    root.dataset.qaScenario = evaluations === 1 ? 'mill-complete' : entry.scenario;
    output.dataset.lastObservation = JSON.stringify({ event: evaluations === 2 ? 'loading' : 'frame', renderCalls: evaluations === 2 ? null : 10, renderTriangles: 20 });
    return { result: { value: eval(String(parameters!.expression)) as unknown } };
  } };
  const result = await waitForKeep04ProbeObservation(session, entry, { frameId: 'main-frame', loaderId: 'requested-document' });
  expect(result).toMatchObject({ mode: 'webgl', scenario: 'empty', observation: { event: 'frame', renderCalls: 10 } });
  expect(checks).toBe(4); expect(evaluations).toBe(3);
});
