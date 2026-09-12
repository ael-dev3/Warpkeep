import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Keep04Schematic } from '../src/components/keep04/Keep04Schematic';
import { Keep04Screen, type Keep04UiSelection } from '../src/components/keep04/Keep04Screen';
import type { Placement04 } from '../spacetimedb/gameplay04/placement';
import type { Controller04, Snapshot04 } from '../src/ptr/gameplay04/createGameplay04Controller';
import { decodeState04 } from '../src/ptr/gameplay04/gameplay04State';
import { presentState04 } from '../src/ptr/gameplay04/gameplay04Presentation';
import { ATLAS04, SCOPE04, MILL_PLACEMENT04, wireWithBuilding04, constructingWire04, freshWire04 } from './fixtures/gameplay04Client';
afterEach(cleanup);

// jsdom has no SVG layout. Supply the native screen transform of a bordered,
// xMidYMid meet viewport separately from its full bounding rectangle.
function mockSchematicViewport(map: HTMLElement, width: number, height: number, border = 0) {
  const left = 30; const top = 50;
  const scale = Math.min((width - 2 * border) / 88, (height - 2 * border) / 72);
  const planLeft = left + (width - 88 * scale) / 2;
  const planTop = top + (height - 72 * scale) / 2;
  vi.spyOn(map, 'getBoundingClientRect').mockReturnValue({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => {} });
  Object.defineProperty(map, 'getScreenCTM', { configurable: true, value: () => ({ inverse: () => ({
    a: 1 / scale, b: 0, c: 0, d: 1 / scale, e: -44 - planLeft / scale, f: -40 - planTop / scale,
  }) }) });
  return { left, top, planLeft, planTop, scale,
    point: (x: number, z: number) => ({ clientX: planLeft + (x + 44) * scale, clientY: planTop + (z + 40) * scale }) };
}

it.each(['busy', 'shortage'] as const)('does not present a legal site as build-ready with %s', reason => {
  const wire = reason === 'busy' ? constructingWire04() : freshWire04();
  if (reason === 'busy') Object.assign(wire, { food: 10000n, wood: 10000n, stone: 10000n, gold: 10000n });
  const snapshot: Snapshot04 = { phase: 'ready', problem: 'none', view: presentState04(decodeState04(wire, SCOPE04), ATLAS04, Date.now()) };
  const controller: Controller04 = { getSnapshot: () => snapshot, subscribe: () => () => {}, refresh: vi.fn(async () => {}), setAtlas: vi.fn(), submit: vi.fn(async () => {}), retryPending: vi.fn(async () => {}), dispose: vi.fn() };
  render(<Keep04Screen snapshot={snapshot} controller={controller}
    selection={{ panel: 'buildings', selectedKind: 'lumber-camp', draft: { kind: 'lumber-camp', x: 20_000_000n, z: -20_000_000n, rotation: 0 } }}
    onSelectionChange={vi.fn()} onBack={vi.fn()} quality="reduced" reducedMotion onFindResources={vi.fn()} onReturnToWorld={vi.fn()} />);
  const confirm = screen.getByRole('button', { name: 'Confirm placement' });
  expect(confirm).toBeDisabled();
  fireEvent.click(confirm); expect(controller.submit).not.toHaveBeenCalled();
  if (reason === 'busy') expect(screen.getByText('Builder busy')).toBeVisible();
  else expect(screen.getAllByRole('button', { name: /Find (food|wood|stone)/ }).length).toBeGreaterThan(0);
  expect(screen.queryByText(/ready to build/i)).not.toBeInTheDocument();
  expect(screen.getByText('Placement is valid.')).toBeVisible();
});

it('maps taps to the half-meter grid, exposes exclusions and gives keyboard/touch equivalent nudges and rotations', () => {
  let latest: Placement04 | null = MILL_PLACEMENT04;
  function Harness() {
    const [draft, setDraft] = useState<Placement04 | null>(MILL_PLACEMENT04);
    latest = draft;
    return <Keep04Schematic buildings={[]} draft={draft} selectedKind="city-mill" onSelect={vi.fn()}
      onChange={setDraft} />;
  }
  render(<Harness />); const map = screen.getByRole('application', { name: 'Keep placement schematic' });
  const viewport = mockSchematicViewport(map, 880, 720);
  fireEvent.click(map, viewport.point(-23.9, -19.9));
  expect(latest).toEqual(MILL_PLACEMENT04);
  fireEvent.keyDown(map, { key: 'ArrowRight' }); expect(latest?.x).toBe(-23_500_000n);
  fireEvent.click(screen.getByRole('button', { name: 'Move left 0.5 m' })); expect(latest?.x).toBe(-24_000_000n);
  fireEvent.keyDown(map, { key: 'ArrowUp' }); fireEvent.click(screen.getByRole('button', { name: 'Move down 0.5 m' })); expect(latest?.z).toBe(-20_000_000n);
  fireEvent.keyDown(map, { key: 'r' }); expect(latest?.rotation).toBe(90_000);
  fireEvent.click(screen.getByRole('button', { name: 'Rotate 90°' })); expect(latest?.rotation).toBe(180_000);
  fireEvent.click(map, viewport.point(0, 20)); expect(screen.getByRole('status')).toHaveTextContent('Keep roads and civic space clear.');
  expect(screen.getByText('Civic commons')).toBeVisible(); expect(screen.getByText('Gate spine')).toBeVisible(); expect(screen.getByText('Gate approach')).toBeVisible();
  expect(screen.getByText('Civic commons').namespaceURI).toBe('http://www.w3.org/1999/xhtml');
});

it.each([
  ['wide letterboxed', 600, 240],
  ['tall letterboxed', 240, 400],
  ['mobile bordered', 180, 180 * 72 / 88],
] as const)('places the draft at the rendered point in a %s schematic', (_name, width, height) => {
  const change = vi.fn();
  render(<Keep04Schematic buildings={[]} draft={MILL_PLACEMENT04} selectedKind="city-mill" onSelect={vi.fn()} onChange={change} />);
  const map = screen.getByRole('application', { name: 'Keep placement schematic' });
  const viewport = mockSchematicViewport(map, width, height, 2);
  fireEvent.click(map, viewport.point(-24, -20));
  expect(change).toHaveBeenLastCalledWith(MILL_PLACEMENT04);
  fireEvent.click(map, viewport.point(18.26, -16.76));
  expect(change).toHaveBeenLastCalledWith({ ...MILL_PLACEMENT04, x: 18_500_000n, z: -17_000_000n });
});

it.each([[600, 240], [240, 400]] as const)('ignores border and letterbox taps in a %i by %i schematic', (width, height) => {
  const change = vi.fn();
  render(<Keep04Schematic buildings={[]} draft={MILL_PLACEMENT04} selectedKind="city-mill" onSelect={vi.fn()} onChange={change} />);
  const map = screen.getByRole('application', { name: 'Keep placement schematic' });
  const viewport = mockSchematicViewport(map, width, height, 2);
  for (const [clientX, clientY] of [
    [viewport.left + 1, viewport.top + height / 2],
    [viewport.left + width - 1, viewport.top + height / 2],
    [viewport.left + width / 2, viewport.top + 1],
    [viewport.left + width / 2, viewport.top + height - 1],
    [viewport.planLeft - 0.1, viewport.top + height / 2],
    [viewport.planLeft + 88 * viewport.scale + 0.1, viewport.top + height / 2],
    [viewport.left + width / 2, viewport.planTop - 0.1],
    [viewport.left + width / 2, viewport.planTop + 72 * viewport.scale + 0.1],
  ]) fireEvent.click(map, { clientX, clientY });
  expect(change).not.toHaveBeenCalled();
  fireEvent.keyDown(map, { key: 'ArrowRight' });
  expect(change).toHaveBeenCalledWith({ ...MILL_PLACEMENT04, x: -23_500_000n });
});

it('does not move a draft without a usable rendered transform', () => {
  const change = vi.fn();
  render(<Keep04Schematic buildings={[]} draft={MILL_PLACEMENT04} selectedKind="city-mill" onSelect={vi.fn()} onChange={change} />);
  const map = screen.getByRole('application', { name: 'Keep placement schematic' });
  const viewport = mockSchematicViewport(map, 880, 720);
  Object.defineProperty(map, 'getScreenCTM', { value: () => null });
  fireEvent.click(map, viewport.point(-24, -20));
  Object.defineProperty(map, 'getScreenCTM', { value: () => ({ inverse: () => ({ a: NaN, b: NaN, c: NaN, d: NaN, e: NaN, f: NaN }) }) });
  fireEvent.click(map, viewport.point(-24, -20));
  expect(change).not.toHaveBeenCalled();
});

it.each([1, 5])('preserves the exact upgrade transform and a numeric completed-level badge at level %i', level => {
  const wire = wireWithBuilding04('city-mill', level); Object.assign(wire, { food: 10000n, wood: 10000n, stone: 10000n, gold: 10000n });
  wire.buildings[0].rotation = 90_000;
  const snapshot: Snapshot04 = { phase: 'ready', problem: 'none', view: presentState04(decodeState04(wire, SCOPE04), ATLAS04, Date.now()) };
  const controller: Controller04 = { getSnapshot: () => snapshot, subscribe: () => () => {}, refresh: vi.fn(async () => {}), setAtlas: vi.fn(), submit: vi.fn(async () => {}), retryPending: vi.fn(async () => {}), dispose: vi.fn() };
  function Harness() {
    const [selection, onSelectionChange] = useState<Keep04UiSelection>({ panel: 'buildings', selectedKind: 'city-mill', draft: { ...MILL_PLACEMENT04, x: 20_000_000n } });
    return <Keep04Screen snapshot={snapshot} controller={controller} selection={selection} onSelectionChange={onSelectionChange}
      onBack={vi.fn()} quality="reduced" reducedMotion onFindResources={vi.fn()} onReturnToWorld={vi.fn()} />;
  }
  render(<Harness />);
  expect(screen.getAllByText(`Completed level ${level}`).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: 'Rotate 90°' })).not.toBeInTheDocument();
  const confirm = screen.getByRole('button', { name: /Confirm upgrade/ });
  if (level === 5) {
    expect(confirm).toBeDisabled(); expect(screen.getAllByText('Maximum level').length).toBeGreaterThan(0);
    const mill = within(screen.getByRole('article', { name: 'City Mill' }));
    expect(mill.getByText('Current: 20')).toBeVisible();
    expect(mill.queryByText(/Next:|Missing:|Cost:|Build duration:/)).not.toBeInTheDocument();
  }
  else { fireEvent.click(confirm); expect(controller.submit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'build', quote: expect.objectContaining({ placement: { ...MILL_PLACEMENT04, rotation: 90_000 } }) })); }
});

it('keeps layout rules scoped and includes narrow-screen, forced-color and reduced-motion protections', () => {
  const css = readFileSync('src/components/keep04/Keep04Screen.css', 'utf8');
  expect(css).not.toMatch(/\.inner-keep|:root|\bbody\s*\{/);
  expect(css).toContain('.keep04'); expect(css).toContain('320px'); expect(css).toContain('44px');
  expect(css).toContain('forced-colors: active'); expect(css).toContain('prefers-reduced-motion: reduce');
  expect(css).toContain('safe-area-inset-bottom'); expect(css).toContain('position: sticky');
  expect(css).not.toMatch(/(^|,\s*)\.keep04-/m);
});

it('selects a persisted footprint with pointer or keyboard instead of moving a draft onto it', () => {
  const view = presentState04(decodeState04(wireWithBuilding04(), SCOPE04), ATLAS04, Date.now());
  const select = vi.fn(); const change = vi.fn();
  render(<Keep04Schematic buildings={view.buildings} selectedKind="lumber-camp" draft={{ ...MILL_PLACEMENT04, kind: 'lumber-camp', x: 20_000_000n }} onSelect={select} onChange={change} />);
  const site = screen.getByRole('button', { name: 'City Mill footprint, completed level 1' });
  fireEvent.click(site); fireEvent.keyDown(site, { key: 'Enter' }); fireEvent.keyDown(site, { key: ' ' });
  expect(select).toHaveBeenCalledTimes(3); expect(select).toHaveBeenLastCalledWith('city-mill'); expect(change).not.toHaveBeenCalled();
});
