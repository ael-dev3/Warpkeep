import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createElement } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Keep04SceneHost, KEEP04_AMBIENT_WINDOW_MS } from '../src/components/keep04/Keep04SceneHost';
import type { VisualState04 } from '../src/components/keep04/createKeep04Scene';
import type { InnerKeepRuntimeAssetBundle } from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';
import * as assetsLoader from '../src/components/keep04/loadKeep04Assets';
import { createKeep04QaScenario } from '../src/dev/keep04QaScenarios';
import { keep04WorkerVisuals } from '../src/components/keep04/Keep04Screen';

vi.mock('three', async importOriginal => {
  const original = await importOriginal<typeof import('three')>();
  return { ...original, WebGLRenderer: vi.fn() };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const empty = (): InnerKeepRuntimeAssetBundle => ({ staticPrefabs: new Map(), populationPrefabs: new Map(), failures: [], dispose: vi.fn() });
const visual: VisualState04 = { buildings: [], selectedKind: null, draft: null, draftValid: false, workers: [] };

// Only the asset request, GPU and browser observers are doubled; the real host,
// scene, landscape and life run their own scheduling and lifecycle.
async function mountAmbientHost(options: Readonly<{ quality: 'high' | 'balanced' | 'reduced'; reducedMotion?: boolean; ambientLife?: boolean }>) {
  const queued = new Map<number, FrameRequestCallback>(); const renderedAt: number[] = [];
  let sequence = 0; let timestamp = 0; let hidden = false;
  const visibility: { callback?: IntersectionObserverCallback; observed: number; disconnected: number } = { observed: 0, disconnected: 0 };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { queued.set(++sequence, callback); return sequence; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { queued.delete(id); });
  vi.stubGlobal('WebGL2RenderingContext', class {});
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { visibility.callback = callback; }
    observe() { visibility.observed++; } disconnect() { visibility.disconnected++; }
  });
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.spyOn(performance, 'now').mockImplementation(() => timestamp);
  vi.spyOn(assetsLoader, 'loadKeep04Assets').mockResolvedValue(empty());
  class RendererBoundary {
    domElement = document.createElement('canvas'); shadowMap = {}; info = { render: { calls: 0, triangles: 0 } };
    setPixelRatio() {} setSize() {} dispose() {} forceContextLoss() {}
    render() { renderedAt.push(timestamp); }
  }
  vi.mocked(THREE.WebGLRenderer).mockImplementation(function () { return new RendererBoundary() as unknown as THREE.WebGLRenderer; });
  const props = { visual, quality: options.quality, reducedMotion: options.reducedMotion ?? false, ambientLife: options.ambientLife ?? true,
    onMode: vi.fn(), onSelect: vi.fn(), onPlacement: vi.fn() };
  const mounted = render(createElement(Keep04SceneHost, props));
  await act(async () => {});
  const canvas = mounted.container.querySelector('canvas')!;
  function frame(now: number) {
    timestamp = now; const callbacks = [...queued.values()]; queued.clear();
    expect(callbacks.length).toBeLessThanOrEqual(1);
    act(() => { callbacks.forEach(callback => callback(now)); });
  }
  return {
    frame, queued, renderedAt, canvas, mounted, visibility,
    setHidden: (value: boolean) => { hidden = value; fireEvent(document, new Event('visibilitychange')); },
    setOnscreen: (value: boolean) => act(() => visibility.callback!([{ isIntersecting: value } as IntersectionObserverEntry], {} as IntersectionObserver)),
  };
}

it.each([['high', 30], ['balanced', 24]] as const)('paces %s ambient life at its existing cap without catch-up bursts', async (quality, cap) => {
  const host = await mountAmbientHost({ quality });
  for (let i = 0; i <= 240; i++) host.frame(i * 1000 / 60 + [0, .01, -.01][i % 3]);
  const intervals = host.renderedAt.slice(1).map((time, i) => time - host.renderedAt[i]);
  // Phase-kept cadence: never two renders in one display frame, never above the cap.
  expect(Math.min(...intervals)).toBeGreaterThanOrEqual(1000 / 60 - .05);
  const seconds = (host.renderedAt.at(-1)! - host.renderedAt[0]) / 1000;
  expect(host.renderedAt.length - 1).toBeLessThanOrEqual(Math.ceil(seconds * cap) + 1);
  expect(host.renderedAt.length).toBeGreaterThan(4 * cap * .8);
  expect(host.queued.size).toBe(1);
  host.mounted.unmount(); expect(host.queued.size).toBe(0);
});

it('stops decoration while hidden or scrolled away and resumes on return', async () => {
  const host = await mountAmbientHost({ quality: 'high' });
  host.frame(0); expect(host.queued.size).toBe(1);
  host.setOnscreen(false); host.frame(40); host.frame(80);
  expect(host.queued.size).toBe(0);
  const offscreenRenders = host.renderedAt.length; host.frame(200); expect(host.renderedAt).toHaveLength(offscreenRenders);
  host.setOnscreen(true); expect(host.queued.size).toBe(1);
  host.frame(260); expect(host.renderedAt.length).toBe(offscreenRenders + 1);
  host.setHidden(true); expect(host.queued.size).toBe(0);
  host.setHidden(false); host.frame(400); expect(host.queued.size).toBe(1);
  host.mounted.unmount(); expect(host.visibility.disconnected).toBeGreaterThanOrEqual(1); expect(host.queued.size).toBe(0);
});

it('sleeps after the ambient window without input and wakes on the next gesture', async () => {
  const host = await mountAmbientHost({ quality: 'balanced' });
  host.frame(0);
  let time = 0;
  while (time < KEEP04_AMBIENT_WINDOW_MS + 500 && host.queued.size > 0) { time += 100; host.frame(time); }
  expect(time).toBeGreaterThanOrEqual(KEEP04_AMBIENT_WINDOW_MS);
  expect(host.queued.size).toBe(0);
  const asleep = host.renderedAt.length;
  host.frame(time + 1000); expect(host.renderedAt).toHaveLength(asleep);
  fireEvent.wheel(host.canvas, { deltaY: -10 }); expect(host.queued.size).toBe(1);
  host.frame(time + 1100); expect(host.renderedAt).toHaveLength(asleep + 1);
  expect(host.queued.size).toBe(1); // Awake again: decoration continues.
  host.mounted.unmount();
});

it.each([
  ['reduced motion', { quality: 'high' as const, reducedMotion: true }],
  ['ambient life off', { quality: 'balanced' as const, ambientLife: false }],
])('keeps the original no-idle-loop contract with %s', async (_label, options) => {
  const host = await mountAmbientHost(options);
  host.frame(0); host.frame(50); host.frame(100);
  expect(host.queued.size).toBe(0);
  if (options.ambientLife === false) expect(host.visibility.observed).toBe(0);
  host.mounted.unmount();
});

it('derives only confirmed journey phases and times for the scene from the living fixture', () => {
  const scenario = createKeep04QaScenario('living-keep', 1_800_000_000_000);
  const workers = keep04WorkerVisuals(scenario.snapshot.view);
  expect(workers.map(worker => worker.phase)).toEqual(['outbound', 'gathering', 'returning', 'idle']);
  expect(workers.map(worker => worker.resource)).toEqual(['wood', 'food', 'stone', null]);
  for (const worker of workers) {
    expect(Object.keys(worker).sort()).toEqual(['ordinal', 'phase', 'phaseEndsAtMs', 'phaseStartedAtMs', 'resource']);
    if (worker.phase === 'idle') expect([worker.phaseStartedAtMs, worker.phaseEndsAtMs]).toEqual([null, null]);
    else expect(worker.phaseEndsAtMs!).toBeGreaterThan(worker.phaseStartedAtMs!);
  }
  expect(workers[0].phaseStartedAtMs).toBe(1_800_000_000_000 - 5_000);
  expect(keep04WorkerVisuals(null)).toEqual([]);
});
