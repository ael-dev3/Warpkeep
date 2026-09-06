import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createKeep04CaptureRun, writeKeep04RunFile } from './keep04-capture-output.mjs';

export const KEEP04_QA_ORIGIN = 'http://127.0.0.1:4176';
const SCENARIOS = Object.freeze(['empty', 'mill-placement', 'blocked-placement', 'mill-constructing', 'mill-complete', 'all-six-level-five', 'fallback', 'reduced-motion', 'context-cycle']);
const PROFILES = Object.freeze([
  { id: 'desktop', width: 1440, height: 900, quality: 'high', cpuRate: 1, frameP95Ms: 33.4 },
  { id: 'mobile', width: 390, height: 844, quality: 'balanced', cpuRate: 4, frameP95Ms: 50 },
  { id: 'mobile-reduced', width: 390, height: 844, quality: 'reduced', cpuRate: 4, frameP95Ms: 75 },
  { id: 'landscape', width: 844, height: 390, quality: 'balanced', cpuRate: 4, frameP95Ms: 50 },
]);
const ROOT = resolve(import.meta.dirname, '../..');
const OUTPUT = resolve(ROOT, 'artifacts/keep04-qa');

export function keep04ProbePlan(args) {
  if (args.length !== 1 || args[0] !== `--base-url=${KEEP04_QA_ORIGIN}`) throw new TypeError('Only --base-url=http://127.0.0.1:4176 is accepted; no credentials, paths or remote origins.');
  return { synthetic: true, status: 'not measured', output: 'artifacts/keep04-qa/',
    contract: 'docs/evidence/0.4.0/performance.md', samples: { workloads: 3, secondsEach: 60, coldRunsPerProfile: 10, warmupWorldKeepCycles: 3, measuredWorldKeepCycles: 20, realmCycles: 10, contextCycles: 3 },
    cases: PROFILES.flatMap(profile => SCENARIOS.map(scenario => ({ ...profile, scenario,
      url: `${KEEP04_QA_ORIGIN}/dev/keep04-qa.html?scenario=${scenario}&quality=${profile.quality}` }))),
    missing: ['actual GPU upload measurement', 'GC retained heap', 'production full-world/keep transfer and cycles', 'actual-owner journey', 'physical phone', 'G001 baseline comparison'],
  };
}

// Closure-free: this exact function is evaluated in the requested browser document.
export function readKeep04ProbeDom(expected) {
  if (location.origin !== 'http://127.0.0.1:4176' || location.href !== expected.url) return null;
  const root = document.querySelector('[data-qa-synthetic="true"]');
  const host = document.querySelector('[aria-label="Verdant Citadel scene"]');
  const raw = document.querySelector('[data-qa-observation]')?.dataset.lastObservation;
  const fault = expected.scenario === 'fallback' ? 'webgl-unavailable' : 'none';
  const reducedMotion = expected.scenario === 'reduced-motion';
  if (!root || !host || !raw || root.dataset.qaScenario !== expected.scenario || root.dataset.qaQuality !== expected.quality
    || root.dataset.qaFault !== fault || root.dataset.qaReducedMotion !== String(reducedMotion)
    || innerWidth !== expected.width || innerHeight !== expected.height) return null;
  let last;
  try { last = JSON.parse(raw); } catch { return null; }
  if (!last || typeof last !== 'object') return null;
  const canvasCount = document.querySelectorAll('.keep04 canvas').length;
  if (host.dataset.mode === 'webgl') {
    if (last.event !== 'frame' || canvasCount !== 1
      || ![last.renderCalls, last.renderTriangles].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) return null;
  } else if (host.dataset.mode !== 'fallback' || last.event !== 'fallback') return null;
  return { synthetic: true, scenario: root.dataset.qaScenario, quality: root.dataset.qaQuality, fault, reducedMotion,
    mode: host.dataset.mode, canvasCount, horizontalOverflow: document.documentElement.scrollWidth > innerWidth, observation: last };
}

export async function waitForKeep04ProbeObservation(session, entry, navigation) {
  if (!navigation || typeof navigation.frameId !== 'string' || !navigation.frameId || typeof navigation.loaderId !== 'string' || !navigation.loaderId) {
    throw new Error('The requested new browser document was not identified.');
  }
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const tree = await session.command('Page.getFrameTree');
    const frame = tree?.frameTree?.frame;
    if (frame?.id === navigation.frameId && frame?.loaderId === navigation.loaderId && frame?.url === entry.url) {
      const result = await session.command('Runtime.evaluate', { returnByValue: true,
        expression: `(${readKeep04ProbeDom.toString()})(${JSON.stringify(entry)})` });
      const observation = result?.result?.value;
      if (observation) return observation;
    }
    // Old documents, old scenario/profile DOM and pre-frame WebGL all remain pending.
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error('Synthetic scenario did not become observable in the requested document.');
}

/** Uses the repository CDP command transport shape; reads public QA DOM, never controller state.
 * Caller supplies the already-owned session, not a profile, credential, URL or filesystem destination.
 * This is synthetic render capture, not the final production workload measurement.
 */
export async function runKeep04BrowserProbe(session, suppliedRun) {
  if (!session || typeof session.command !== 'function') throw new TypeError('An existing task-owned CDP command session is required.');
  const plan = keep04ProbePlan([`--base-url=${KEEP04_QA_ORIGIN}`]);
  const run = suppliedRun ?? await createKeep04CaptureRun();
  const observations = [];
  for (const entry of plan.cases) {
    await session.command('Emulation.setDeviceMetricsOverride', { width: entry.width, height: entry.height, deviceScaleFactor: 1, mobile: entry.cpuRate === 4 });
    await session.command('Emulation.setCPUThrottlingRate', { rate: entry.cpuRate });
    const navigation = await session.command('Page.navigate', { url: entry.url });
    const observation = await waitForKeep04ProbeObservation(session, entry, navigation);
    const screenshot = await session.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (typeof screenshot?.data !== 'string' || screenshot.data.length > 12 * 1024 * 1024) throw new Error('Screenshot unavailable or oversized.');
    const filename = `${entry.id}-${entry.scenario}.png`;
    await writeKeep04RunFile(run, filename, Buffer.from(screenshot.data, 'base64'));
    observations.push({ ...entry, ...observation, screenshot: filename, imageInspected: false });
  }
  const report = { ...plan, output: `artifacts/keep04-qa/${run.id}/`, status: 'captured; images require human inspection; performance not measured', observations };
  await writeKeep04RunFile(run, 'synthetic-render-observations.json', `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const plan = keep04ProbePlan(process.argv.slice(2));
    // This entry point deliberately remains plan-only. The separate
    // keep04-windows-capture launcher owns Windows process/profile lifecycle.
    await mkdir(OUTPUT, { recursive: true });
    await writeFile(resolve(OUTPUT, 'manual-capture-plan.json'), `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
    console.log('Manual capture plan written below artifacts/keep04-qa; no measurements claimed. Windows execution uses keep04-windows-capture.mjs with the same fixed base-url argument.');
  } catch (error) { console.error(error instanceof Error ? error.message : 'Keep QA probe failed.'); process.exitCode = 1; }
}
