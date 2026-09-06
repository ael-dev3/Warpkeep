import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Keep04Screen, type Keep04UiSelection } from '../src/components/keep04/Keep04Screen';
import type { Keep04SceneHostProps } from '../src/components/keep04/Keep04SceneHost';
import { createKeep04QaSnapshot } from '../src/dev/Keep04QaHarness';
import type { Controller04 } from '../src/ptr/gameplay04/createGameplay04Controller';
import { readFileSync } from 'node:fs';

let sceneProps: Keep04SceneHostProps;
// This file isolates screen DOM/focus ownership; actual scene lifecycle is covered in Keep04SceneHost.test.tsx.
vi.mock('../src/components/keep04/Keep04SceneHost', () => ({ Keep04SceneHost: (props: Keep04SceneHostProps) => { sceneProps = props; return null; } }));
afterEach(cleanup);
function setup(fixture: 'empty' | 'construction' | 'complete' = 'empty') {
  const snapshot = createKeep04QaSnapshot(fixture);
  const controller: Controller04 = { getSnapshot: () => snapshot, subscribe: () => () => {}, refresh: vi.fn(async () => {}), submit: vi.fn(async () => {}), retryPending: vi.fn(async () => {}), setAtlas: vi.fn(), dispose: vi.fn() };
  function Harness() {
    const [selection, onSelectionChange] = useState<Keep04UiSelection>({ panel: null, selectedKind: null, draft: null });
    return <Keep04Screen snapshot={snapshot} controller={controller} selection={selection} onSelectionChange={onSelectionChange} onBack={vi.fn()} quality="balanced" reducedMotion onFindResources={vi.fn()} onReturnToWorld={vi.fn()} />;
  }
  render(<Harness />); return controller;
}
it('keeps the schematic, controls, selection and focus mounted through loading/webgl/fallback transitions', () => {
  const controller = setup(); const opener = screen.getByRole('button', { name: 'Buildings' }); fireEvent.click(opener);
  fireEvent.click(screen.getByRole('button', { name: 'City Mill' }));
  const schematic = screen.getByRole('application', { name: 'Keep placement schematic' }); schematic.focus();
  const worker = screen.getByRole('button', { name: /Worker 1/ }); const confirm = screen.getByRole('button', { name: /Confirm placement/ });
  fireEvent.keyDown(schematic, { key: 'ArrowRight' }); fireEvent.keyDown(schematic, { key: 'r' });
  const draft = sceneProps.visual.draft;
  for (const mode of ['webgl', 'loading', 'fallback'] as const) {
    act(() => sceneProps.onMode(mode));
    expect(screen.getByRole('application', { name: 'Keep placement schematic' })).toBe(schematic);
    expect(schematic).toHaveFocus(); expect(screen.getByRole('button', { name: /Worker 1/ })).toBe(worker);
    expect(screen.getByRole('button', { name: /Confirm placement/ })).toBe(confirm); expect(sceneProps.visual.draft).toEqual(draft);
  }
  expect(screen.getByText(/3D graphics.*unavailable/i)).toBeVisible(); expect(controller.submit).not.toHaveBeenCalled();
  fireEvent.keyDown(schematic, { key: 'Escape' }); expect(opener).toHaveFocus();
});

it.each([['construction', 0, 'constructing'], ['complete', 1, 'complete']] as const)('exposes the %s building level and phase as an accessible control name', (fixture, level, phase) => {
  setup(fixture);
  expect(screen.getByRole('button', { name: new RegExp(`Select City Mill.*level ${level}.*${phase}`) })).toBeVisible();
});

it('reopens a user-collapsed schematic after graphics fail without replacing its DOM', () => {
  setup(); act(() => sceneProps.onMode('webgl'));
  const schematic = screen.getByRole('application', { name: 'Keep placement schematic' });
  const details = schematic.closest('details')!; details.open = false;
  act(() => sceneProps.onMode('fallback'));
  expect(details.open).toBe(true); expect(screen.getByRole('application', { name: 'Keep placement schematic' })).toBe(schematic);
});

it('returns Escape focus to Buildings when a non-focusable canvas opened the building panel', () => {
  setup(); act(() => sceneProps.onSelect('city-mill'));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close panel' }), { key: 'Escape' });
  expect(screen.getByRole('button', { name: 'Buildings' })).toHaveFocus();
});

it('puts compact primary commands before the scene and preserves their opener focus without collapsing the schematic', () => {
  setup();
  const commands = screen.getByRole('navigation', { name: 'Primary keep actions' });
  const schematic = screen.getByRole('application', { name: 'Keep placement schematic' });
  expect(commands.compareDocumentPosition(schematic) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  const primary = commands.querySelector('button')!; fireEvent.click(primary);
  expect(screen.getByRole('complementary', { name: 'Command panel' })).toBeVisible();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close panel' }), { key: 'Escape' });
  expect(primary).toHaveFocus(); expect(schematic.closest('details')!.open).toBe(true);
});

it('keeps valid and blocked footprints distinct using system colors and line patterns in forced-colors rules', () => {
  setup(); fireEvent.click(screen.getByRole('button', { name: 'Buildings' })); fireEvent.click(screen.getByRole('button', { name: 'City Mill' }));
  const source = document.createElement('style'); source.textContent = readFileSync('src/components/keep04/Keep04Screen.css', 'utf8'); document.head.append(source);
  // jsdom cannot activate OS media preferences. Apply the actual forced-colors
  // branch through CSSOM, then inspect computed styles on the real rendered draft.
  const forced = document.createElement('style');
  forced.textContent = Array.from(source.sheet!.cssRules).filter(rule => rule instanceof CSSMediaRule && rule.conditionText.includes('forced-colors')).map(rule => Array.from((rule as CSSMediaRule).cssRules).map(child => child.cssText).join('\n')).join('\n');
  document.head.append(forced);
  try {
    const draft = document.querySelector('.keep04-draft')!;
    const validPattern = getComputedStyle(draft).strokeDasharray;
    act(() => sceneProps.onPlacement({ ...sceneProps.visual.draft!, x: 0n, z: 0n }));
    expect(screen.getByText('Keep roads and civic space clear.')).toBeVisible();
    expect(getComputedStyle(draft).stroke).toBe(getComputedStyle(document.querySelector('.keep04')!).color);
    expect(getComputedStyle(draft).strokeDasharray).not.toBe(validPattern);
    expect(getComputedStyle(draft).strokeDasharray).toBe('1 .7');
  } finally { source.remove(); forced.remove(); }
});
