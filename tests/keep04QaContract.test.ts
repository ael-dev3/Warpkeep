import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Keep04QaHarness, serializeKeep04QaObservation } from '../src/dev/Keep04QaHarness';
import { KEEP04_QA_SCENARIOS, createKeep04QaScenario } from '../src/dev/keep04QaScenarios';
import { evaluatePlacement04 } from '../spacetimedb/gameplay04/placement';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

it('provides every requested decoder-valid fixture and the validated all-six layout', () => {
  expect(KEEP04_QA_SCENARIOS).toEqual(['empty', 'mill-placement', 'blocked-placement', 'mill-constructing', 'mill-complete', 'all-six-level-five', 'fallback', 'reduced-motion', 'context-cycle']);
  for (const id of KEEP04_QA_SCENARIOS) {
    const scenario = createKeep04QaScenario(id, 1000000);
    expect(scenario.synthetic).toBe(true);
    expect(scenario.snapshot.phase).toBe('ready');
    if (id === 'mill-placement' || id === 'blocked-placement') expect(scenario.snapshot.view?.atlas).toEqual({ atlasId: 'synthetic-local-qa', revision: 1n });
    else expect(scenario.snapshot.view?.atlas).toBeNull();
  }
  const all = createKeep04QaScenario('all-six-level-five').snapshot.view!.buildings;
  expect(all.map(b => [b.kind, b.placement.x, b.placement.z, b.completedLevel])).toEqual([
    ['city-mill', -15000000n, 15000000n, 5], ['lumber-camp', -15000000n, 26000000n, 5],
    ['city-stoneworks', 15000000n, 10000000n, 5], ['city-goldworks', 15000000n, 22000000n, 5],
    ['city-barracks', 20000000n, -30000000n, 5], ['grand-covenant-cathedral', -25500000n, -23500000n, 5],
  ]);
  all.forEach(b => expect(evaluatePlacement04(b.placement, all.filter(other => other !== b).map(other => other.placement)).valid).toBe(true));
  expect(evaluatePlacement04(createKeep04QaScenario('mill-placement').selection.draft!, []).valid).toBe(true);
  expect(evaluatePlacement04(createKeep04QaScenario('blocked-placement').selection.draft!, []).reason).toBe('reserved');
});

it.each(['empty', 'mill-placement', 'blocked-placement', 'mill-constructing', 'mill-complete', 'all-six-level-five', 'fallback', 'reduced-motion', 'context-cycle'])('renders the actual keep controls for synthetic %s', id => {
  vi.stubGlobal('WebGL2RenderingContext', undefined);
  window.history.replaceState({}, '', `/?scenario=${id}`);
  const mounted = render(createElement(Keep04QaHarness));
  expect(mounted.container.querySelector('[data-qa-synthetic="true"]')).not.toBeNull();
  expect(screen.getByRole('heading', { name: 'Your keep' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Resources' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Return to world' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Verdant Citadel scene' })).toHaveAttribute('data-mode', 'fallback');
});

it('keeps confirmation synthetic and lets the user open Workers, unmount, and remount the real keep', () => {
  vi.stubGlobal('WebGL2RenderingContext', undefined);
  window.history.replaceState({}, '', '/?scenario=mill-placement');
  const mounted = render(createElement(Keep04QaHarness));
  fireEvent.click(screen.getByRole('button', { name: /Confirm placement/ }));
  expect(screen.getByText(/Synthetic controller: command suppressed/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Worker 1 · idle' }));
  expect(screen.getByRole('complementary', { name: 'Command panel' })).toBeVisible();
  fireEvent.click(screen.getByText('Synthetic controller · local visual QA only · Controls'));
  fireEvent.click(screen.getByRole('button', { name: 'Unmount keep' }));
  expect(mounted.container.querySelector('.keep04')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Mount keep' }));
  expect(screen.getByRole('heading', { name: 'Your keep' })).toBeVisible();
});

it('serializes only bounded numeric observations, never arbitrary credentials, owner or atlas fields', () => {
  const hostile = { event: 'frame', timestampMs: 42, frameWorkMs: 2, renderCalls: 10, requestKey: 'secret-request', jwt: 'secret-jwt', ownerIdentity: 'secret-owner', atlas: { privateResponse: 'secret-atlas' }, rendererTextures: Infinity };
  const json = serializeKeep04QaObservation(hostile);
  expect(JSON.parse(json)).toMatchObject({ event: 'frame', timestampMs: 42, frameWorkMs: 2, renderCalls: 10 });
  expect(json).not.toMatch(/secret|requestKey|jwt|ownerIdentity|atlas|Infinity/);
  expect(JSON.parse(json).rendererTextures).toBeNull();
});

it('freezes capture configuration and retains its provenance when idle controls later change', () => {
  vi.stubGlobal('WebGL2RenderingContext', undefined);
  window.history.replaceState({}, '', '/?scenario=fallback&quality=reduced&motion=reduced');
  const mounted = render(createElement(Keep04QaHarness));
  fireEvent.click(screen.getByText('Synthetic controller · local visual QA only · Controls'));
  fireEvent.click(screen.getByRole('button', { name: 'Start bounded observation' }));
  for (const name of ['QA scenario', 'Scene quality', 'Graphics fault']) expect(screen.getByRole('combobox', { name })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Empty keep fixture' })).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox', { name: 'QA scenario' }), { target: { value: 'empty' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Scene quality' }), { target: { value: 'high' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Graphics fault' }), { target: { value: 'none' } });
  expect(mounted.container.querySelector('main')).toHaveAttribute('data-qa-scenario', 'fallback');
  expect(mounted.container.querySelector('main')).toHaveAttribute('data-qa-quality', 'reduced');
  expect(mounted.container.querySelector('main')).toHaveAttribute('data-qa-fault', 'webgl-unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Unmount keep' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mount keep' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop and publish observation' }));
  const read = () => JSON.parse(mounted.container.querySelector('[data-qa-observation]')!.textContent!);
  const first = read();
  expect(first).toMatchObject({ scenario: 'fallback', quality: 'reduced', fault: 'webgl-unavailable', reducedMotion: true });
  expect(first.records.map((record: { event: string }) => record.event)).toEqual(['disposed', 'fallback']);
  fireEvent.change(screen.getByRole('combobox', { name: 'QA scenario' }), { target: { value: 'empty' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Scene quality' }), { target: { value: 'high' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish current observation' }));
  expect(read()).toMatchObject({ scenario: 'fallback', quality: 'reduced', fault: 'webgl-unavailable', reducedMotion: true, records: first.records, lastObservation: first.lastObservation });
});

it('does not reset a running capture and drains queued long tasks before Stop publishes', () => {
  vi.stubGlobal('WebGL2RenderingContext', undefined);
  let pending: PerformanceEntry[] = [];
  let connections = 0;
  vi.stubGlobal('PerformanceObserver', class {
    static supportedEntryTypes = ['longtask'];
    observe() { connections++; }
    takeRecords() { const records = pending; pending = []; return records; }
    disconnect() { connections--; }
  });
  const mounted = render(createElement(Keep04QaHarness));
  fireEvent.click(screen.getByText('Synthetic controller · local visual QA only · Controls'));
  const start = screen.getByRole('button', { name: 'Start bounded observation' });
  fireEvent.click(start); expect(start).toBeDisabled(); fireEvent.click(start);
  const queuedAt = performance.now(); pending = [{ startTime: queuedAt, duration: 80 } as PerformanceEntry];
  fireEvent.click(screen.getByRole('button', { name: 'Stop and publish observation' }));
  const report = JSON.parse(mounted.container.querySelector('[data-qa-observation]')!.textContent!);
  expect(report.longTaskSupported).toBe(true);
  expect(report.longTasks).toEqual([{ startTime: queuedAt, duration: 80 }]);
  expect(report.longTasks).toHaveLength(1); expect(connections).toBe(0);
  expect(report.startedAtMs).toBeLessThanOrEqual(queuedAt); expect(report.stoppedAtMs).toBeGreaterThanOrEqual(queuedAt);
  fireEvent.click(start); fireEvent.click(screen.getByRole('button', { name: 'Stop and publish observation' }));
  expect(JSON.parse(mounted.container.querySelector('[data-qa-observation]')!.textContent!)).toMatchObject({ longTaskSupported: true, longTasks: [] });
});

it.each(['--base-url=https://example.com', '--base-url=http://127.0.0.1:5173', '--jwt=secret', '--output=../escape'])('rejects unapproved browser-probe argument %s before browser or filesystem work', argument => {
  const result = spawnSync(process.execPath, ['scripts/qa-observer/keep04-browser-probe.mjs', argument], { encoding: 'utf8' });
  expect(result.status).toBe(1); expect(result.stderr).toMatch(/Only --base-url=http:\/\/127.0.0.1:4176 is accepted/);
});

// Run explicitly after the production build; never treat a pre-build skip as production evidence.
it.runIf(process.env.KEEP04_QA_VERIFY_DIST === '1')('excludes the QA entry, fixture and DEV fault branches from the actual production build', () => {
  const checked = spawnSync(process.execPath, ['scripts/verify-production-dist-exclusions.mjs'], { encoding: 'utf8' });
  expect(checked.status, checked.stderr).toBe(0);
  const root = resolve('dist');
  let ptrChunks = 0;
  function inspect(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else if (/\.(html|js)$/.test(entry.name)) {
        expect(path).not.toContain('keep04-qa');
        const content = readFileSync(path, 'utf8');
        expect(content.match(/synthetic-local-qa-not-an-identity|data-qa-synthetic|QA voxel preparation failure|missing-model|voxel-failure/), path).toBeNull();
        // The existing G001/Realm recovery contract legitimately uses this generic label.
        if (entry.name.startsWith('PtrGameplay04SurfaceHost-') && entry.name.endsWith('.js')) {
          ptrChunks++; expect(content.includes('webgl-unavailable'), path).toBe(false);
        }
      }
    }
  }
  inspect(root);
  expect(ptrChunks, 'Expected exactly one emitted PTR gameplay04 JS chunk').toBe(1);
});
