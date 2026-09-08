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
  vi.spyOn(map, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 880, height: 720, right: 880, bottom: 720, toJSON: () => {} });
  fireEvent.click(map, { clientX: 201, clientY: 201 });
  expect(latest).toEqual(MILL_PLACEMENT04);
  fireEvent.keyDown(map, { key: 'ArrowRight' }); expect(latest?.x).toBe(-23_500_000n);
  fireEvent.click(screen.getByRole('button', { name: 'Move left 0.5 m' })); expect(latest?.x).toBe(-24_000_000n);
  fireEvent.keyDown(map, { key: 'ArrowUp' }); fireEvent.click(screen.getByRole('button', { name: 'Move down 0.5 m' })); expect(latest?.z).toBe(-20_000_000n);
  fireEvent.keyDown(map, { key: 'r' }); expect(latest?.rotation).toBe(90_000);
  fireEvent.click(screen.getByRole('button', { name: 'Rotate 90°' })); expect(latest?.rotation).toBe(180_000);
  fireEvent.click(map, { clientX: 440, clientY: 600 }); expect(screen.getByRole('status')).toHaveTextContent('Keep roads and civic space clear.');
  expect(screen.getByText('Civic commons')).toBeVisible(); expect(screen.getByText('Gate spine')).toBeVisible(); expect(screen.getByText('Gate approach')).toBeVisible();
  expect(screen.getByText('Civic commons').namespaceURI).toBe('http://www.w3.org/1999/xhtml');
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
