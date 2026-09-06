import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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

/** Uses the repository CDP command transport shape; reads public QA DOM, never controller state.
 * Caller supplies the already-owned session, not a profile, credential, URL or filesystem destination.
 * This is synthetic render capture, not the final production workload measurement.
 */
export async function runKeep04BrowserProbe(session) {
  if (!session || typeof session.command !== 'function') throw new TypeError('An existing task-owned CDP command session is required.');
  const plan = keep04ProbePlan([`--base-url=${KEEP04_QA_ORIGIN}`]);
  await mkdir(OUTPUT, { recursive: true });
  const observations = [];
  for (const entry of plan.cases) {
    await session.command('Emulation.setDeviceMetricsOverride', { width: entry.width, height: entry.height, deviceScaleFactor: 1, mobile: entry.cpuRate === 4 });
    await session.command('Emulation.setCPUThrottlingRate', { rate: entry.cpuRate });
    await session.command('Page.navigate', { url: entry.url });
    let observation = null;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const result = await session.command('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        if (location.origin !== '${KEEP04_QA_ORIGIN}') throw new Error('Local QA boundary changed.');
        const root = document.querySelector('[data-qa-synthetic="true"]');
        const host = document.querySelector('[aria-label="Verdant Citadel scene"]');
        const raw = document.querySelector('[data-qa-observation]')?.dataset.lastObservation;
        if (!root || !host || host.dataset.mode === 'loading' || !raw) return null;
        const last = JSON.parse(raw);
        return { synthetic: true, scenario: root.dataset.qaScenario, mode: host.dataset.mode,
          canvasCount: document.querySelectorAll('.keep04 canvas').length,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth, observation: last };
      })()` });
      observation = result?.result?.value;
      if (observation) break;
      await new Promise(done => setTimeout(done, 100));
    }
    if (!observation || observation.scenario !== entry.scenario) throw new Error('Synthetic scenario did not become observable.');
    const screenshot = await session.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (typeof screenshot?.data !== 'string' || screenshot.data.length > 12 * 1024 * 1024) throw new Error('Screenshot unavailable or oversized.');
    const filename = `${entry.id}-${entry.scenario}.png`;
    await writeFile(resolve(OUTPUT, filename), Buffer.from(screenshot.data, 'base64'), { flag: 'wx' });
    observations.push({ ...entry, ...observation, screenshot: filename, imageInspected: false });
  }
  const report = { ...plan, status: 'captured; images require human inspection; performance not measured', observations };
  await writeFile(resolve(OUTPUT, 'synthetic-render-observations.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const plan = keep04ProbePlan(process.argv.slice(2));
    // Existing attested launcher is macOS codesign-bound. Do not install automation,
    // create another Vite server, or silently substitute an unattested browser here.
    await mkdir(OUTPUT, { recursive: true });
    await writeFile(resolve(OUTPUT, 'manual-capture-plan.json'), `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
    console.log('Browser transport is controller-owned. Manual capture plan written below artifacts/keep04-qa; no measurements claimed. Use the available browser tool, or runKeep04BrowserProbe with an existing attested CDP session.');
  } catch (error) { console.error(error instanceof Error ? error.message : 'Keep QA probe failed.'); process.exitCode = 1; }
}
