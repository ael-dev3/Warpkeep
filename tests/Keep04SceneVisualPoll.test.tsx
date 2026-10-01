import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Keep04Screen, type Keep04UiSelection } from '../src/components/keep04/Keep04Screen';
import type { VisualState04 } from '../src/components/keep04/createKeep04Scene';
import type { Controller04, Snapshot04 } from '../src/ptr/gameplay04/createGameplay04Controller';
import { presentState04 } from '../src/ptr/gameplay04/gameplay04Presentation';
import { decodeState04 } from '../src/ptr/gameplay04/gameplay04State';
import { ATLAS04, MILL_PLACEMENT04, SCOPE04, constructingWire04, freshWire04, wireWithBuilding04 } from './fixtures/gameplay04Client';

const scene = vi.hoisted(() => ({ visuals: [] as unknown[] }));
vi.mock('../src/components/keep04/Keep04SceneHost', () => ({
  Keep04SceneHost: ({ visual }: { visual: unknown }) => { scene.visuals.push(visual); return null; },
}));

afterEach(() => { cleanup(); scene.visuals.length = 0; });

const selection: Keep04UiSelection = { selectedKind: null, draft: null, panel: null };
const controller: Controller04 = {
  getSnapshot: () => ({ phase: 'ready', view: null, problem: 'none' }), subscribe: () => () => {},
  refresh: async () => {}, setAtlas: () => {}, submit: async () => {}, retryPending: async () => {}, dispose: () => {},
};

function snapshot(wire: ReturnType<typeof freshWire04>, receivedAtMs: number): Snapshot04 {
  return { phase: 'ready', problem: 'none', view: presentState04(decodeState04(wire, SCOPE04), ATLAS04, receivedAtMs) };
}

function keep(state: Snapshot04, currentSelection = selection) {
  return <Keep04Screen snapshot={state} controller={controller} selection={currentSelection} onSelectionChange={() => {}}
    onBack={() => {}} quality="reduced" reducedMotion onFindResources={() => {}} onReturnToWorld={() => {}} />;
}

it('keeps the empty first-session scene visual stable across an unchanged authoritative poll', () => {
  const wire = freshWire04();
  const mounted = render(keep(snapshot(wire, 1_000)));
  const first = scene.visuals.at(-1) as VisualState04;
  mounted.rerender(keep(snapshot(structuredClone(wire), 6_000)));
  expect(scene.visuals.at(-1)).toBe(first);
});

it('reconciles construction and completion once, but not repeated identical polls', () => {
  const constructing = constructingWire04();
  const mounted = render(keep(snapshot(constructing, 1_000)));
  const first = scene.visuals.at(-1) as VisualState04;
  mounted.rerender(keep(snapshot(structuredClone(constructing), 6_000)));
  expect(scene.visuals.at(-1)).toBe(first);

  const complete = wireWithBuilding04(); complete.revision = 2n;
  mounted.rerender(keep(snapshot(complete, 11_000)));
  const changed = scene.visuals.at(-1) as VisualState04;
  expect(changed).not.toBe(first);
  expect(changed.buildings[0]).toMatchObject({ kind: 'city-mill', phase: 'complete', completedLevel: 1 });
  mounted.rerender(keep(snapshot(structuredClone(complete), 16_000)));
  expect(scene.visuals.at(-1)).toBe(changed);
});

it('retains a semantically identical draft across polls but reconciles a placement move', () => {
  const wire = freshWire04();
  const firstSelection: Keep04UiSelection = { panel: 'buildings', selectedKind: 'city-mill', draft: MILL_PLACEMENT04 };
  const mounted = render(keep(snapshot(wire, 1_000), firstSelection));
  const first = scene.visuals.at(-1) as VisualState04;
  mounted.rerender(keep(snapshot(structuredClone(wire), 6_000), { ...firstSelection, draft: { ...MILL_PLACEMENT04 } }));
  expect(scene.visuals.at(-1)).toBe(first);
  mounted.rerender(keep(snapshot(structuredClone(wire), 11_000), {
    ...firstSelection, draft: { ...MILL_PLACEMENT04, x: MILL_PLACEMENT04.x + 500_000n },
  }));
  const changed = scene.visuals.at(-1) as VisualState04;
  expect(changed).not.toBe(first);
  expect(changed.draft?.x).toBe(MILL_PLACEMENT04.x + 500_000n);
});
