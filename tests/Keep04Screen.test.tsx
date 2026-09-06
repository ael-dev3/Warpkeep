import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Keep04Screen, type Keep04UiSelection } from '../src/components/keep04/Keep04Screen';
import type { Controller04, Snapshot04 } from '../src/ptr/gameplay04/createGameplay04Controller';
import { presentState04 } from '../src/ptr/gameplay04/gameplay04Presentation';
import { decodeState04 } from '../src/ptr/gameplay04/gameplay04State';
import { ATLAS04, SCOPE04, freshWire04, assignmentWire04, constructingWire04 } from './fixtures/gameplay04Client';

afterEach(() => { cleanup(); vi.useRealTimers(); });
function setup(wire = freshWire04(), phase: Snapshot04['phase'] = 'ready') {
  const snapshot: Snapshot04 = { phase, problem: 'none', view: presentState04(decodeState04(wire, SCOPE04), ATLAS04, Date.now()) };
  const controller: Controller04 = { getSnapshot: () => snapshot, subscribe: () => () => {}, refresh: vi.fn(async () => {}),
    setAtlas: vi.fn(), submit: vi.fn(async () => {}), retryPending: vi.fn(async () => {}), dispose: vi.fn() };
  const back = vi.fn(); const find = vi.fn();
  function Harness({ state = snapshot }: { state?: Snapshot04 }) {
    const [selection, onSelectionChange] = useState<Keep04UiSelection>({ selectedKind: null, draft: null, panel: null });
    return <Keep04Screen snapshot={state} controller={controller} selection={selection} onSelectionChange={onSelectionChange}
      onBack={back} quality="balanced" reducedMotion={false} onFindResources={find} onReturnToWorld={back} />;
  }
  const rendered = render(<Harness />);
  return { controller, back, find, snapshot, rerender: (state: Snapshot04) => rendered.rerender(<Harness state={state} />) };
}
const openMill = () => { fireEvent.click(screen.getByRole('button', { name: 'Buildings' })); fireEvent.click(screen.getByRole('button', { name: 'City Mill' })); };

it('shows four Workers and spendable resources; pending returns never fund permanent placement', () => {
  const wire = freshWire04(); wire.workers[0].assignmentRevision = 1n;
  wire.workers[0].assignment = { ...assignmentWire04(), earned: 60n, phase: 'returning' };
  const { find, controller } = setup(wire);
  for (let n = 1; n <= 4; n++) expect(screen.getByRole('button', { name: new RegExp(`Worker ${n}`) })).toBeVisible();
  for (const resource of ['Food', 'Wood', 'Stone', 'Gold']) expect(within(screen.getByRole('region', { name: 'Resources' })).getByText(resource)).toBeVisible();
  expect(screen.getByText(/pending.*not spendable/i)).toBeVisible(); openMill();
  for (const name of ['City Mill', 'Lumber Camp', 'City Stoneworks', 'City Goldworks', 'City Barracks', 'Grand Covenant Cathedral']) expect(screen.getByRole('button', { name })).toBeVisible();
  expect(screen.getByText(/construction cannot be cancelled/i)).toBeVisible();
  expect(screen.getByText(/spent resources are not refunded/i)).toBeVisible();
  expect(screen.getByRole('button', { name: /Confirm placement/ })).toBeDisabled();
  expect(screen.getByText('Missing: food 20 · wood 40 · stone 20 · gold 0')).toBeVisible();
  fireEvent.click(screen.getAllByRole('button', { name: 'Find food' })[0]); expect(find).toHaveBeenCalledWith('food');
  expect(controller.submit).not.toHaveBeenCalled();
});

it('submits one frozen quote without local deductions and requires review after realm changes', async () => {
  const wire = freshWire04(); Object.assign(wire, { food: 1000n, wood: 1000n, stone: 1000n, gold: 1000n });
  const { controller, snapshot, rerender } = setup(wire); openMill();
  const confirm = screen.getByRole('button', { name: /Confirm placement/ });
  fireEvent.click(confirm); fireEvent.click(confirm); await act(async () => {});
  expect(controller.submit).toHaveBeenCalledTimes(1);
  const intent = vi.mocked(controller.submit).mock.calls[0][0];
  expect(intent.kind).toBe('build');
  if (intent.kind === 'build') { expect(Object.isFrozen(intent.quote)).toBe(true); expect(intent.quote.cost).toEqual({ food: 20n, wood: 40n, stone: 20n, gold: 0n }); }
  expect(within(screen.getByRole('region', { name: 'Resources' })).getAllByText('1000')).toHaveLength(4);
  wire.revision = 2n;
  rerender({ ...snapshot, view: presentState04(decodeState04(wire, SCOPE04), ATLAS04, Date.now()) });
  expect(screen.getByText('Review updated costs and confirm again')).toBeVisible();
  expect(screen.getByRole('button', { name: /Confirm placement/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Review updated costs' }));
  expect(screen.getByRole('button', { name: /Confirm placement/ })).toBeEnabled();
});

it.each(['loading', 'pending', 'uncertain', 'failed', 'disposed'] as const)('blocks new commands in %s', phase => {
  const { controller } = setup(freshWire04(), phase);
  expect(screen.queryByRole('button', { name: 'Buildings' })).not.toBeInTheDocument();
  if (phase === 'uncertain') {
    fireEvent.click(screen.getByRole('button', { name: 'Check outcome' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry same request' }));
    expect(controller.refresh).toHaveBeenCalledTimes(1); expect(controller.retryPending).toHaveBeenCalledTimes(1);
  } else expect(screen.queryByRole('button', { name: 'Retry same request' })).not.toBeInTheDocument();
  expect(controller.submit).not.toHaveBeenCalled();
});

it('initializes only with the initialize intent', () => {
  const { controller } = setup(freshWire04(), 'uninitialized');
  fireEvent.click(screen.getByRole('button', { name: 'Initialize keep' }));
  expect(controller.submit).toHaveBeenCalledWith({ kind: 'initialize' });
});

it('keeps one panel open, restores opener focus with Escape, and retains explicit back/world controls', () => {
  const { back, find } = setup(); const worker = screen.getByRole('button', { name: /Worker 1/ });
  worker.focus(); fireEvent.click(worker); expect(screen.getByRole('region', { name: 'Workers' })).toBeVisible();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close panel' }), { key: 'Escape' }); expect(worker).toHaveFocus();
  openMill(); expect(screen.queryByRole('region', { name: 'Workers' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back' })); fireEvent.click(screen.getByRole('button', { name: 'Return to world' })); expect(back).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Find resources' })); expect(find).toHaveBeenCalledWith(null);
  expect(screen.getByText(/previous action may have completed/i)).toBeVisible();
});

it('keeps the Builder busy after estimated zero and never finishes from the UI clock', () => {
  vi.useFakeTimers(); vi.setSystemTime(1000000);
  const { controller } = setup(constructingWire04()); openMill();
  expect(screen.getByText('Builder busy')).toBeVisible();
  expect(screen.getAllByText('Awaiting Realm update').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /Confirm upgrade/ })).toBeDisabled();
  act(() => { vi.advanceTimersByTime(5000); }); expect(controller.submit).not.toHaveBeenCalled();
  expect(screen.getAllByText('Completed level 0').length).toBeGreaterThan(0);
});

it('shows captured Worker rates and allows recall only before returning with atlas authority', () => {
  const wire = freshWire04(); wire.workers[0].assignmentRevision = 1n; wire.workers[0].assignment = { ...assignmentWire04(), phase: 'gathering' };
  wire.workers[1].assignmentRevision = 1n; wire.workers[1].assignment = { ...assignmentWire04(), phase: 'returning', earned: 60n };
  const { controller } = setup(wire); fireEvent.click(screen.getByRole('button', { name: /Worker 1/ }));
  expect(screen.getAllByText('Captured yield: 10 per 10-second quantum').length).toBe(2);
  fireEvent.click(screen.getByRole('button', { name: 'Recall Worker 1' }));
  expect(controller.submit).toHaveBeenCalledWith({ kind: 'recall', workerOrdinal: 0, atlasRevision: 3n });
  expect(screen.getByRole('button', { name: 'Recall Worker 2' })).toBeDisabled();
});

it('retains the reviewed quote across a refresh and requires explicit review after rejection even at the same revision', () => {
  const wire = freshWire04(); Object.assign(wire, { food: 1000n, wood: 1000n, stone: 1000n, gold: 1000n });
  const { snapshot, rerender } = setup(wire); openMill();
  rerender({ ...snapshot, phase: 'loading', problem: 'reconfirm' });
  expect(screen.queryByRole('button', { name: /Confirm placement/ })).not.toBeInTheDocument();
  rerender({ ...snapshot, phase: 'ready', problem: 'reconfirm' });
  expect(screen.getByText('Review updated costs and confirm again')).toBeVisible();
  expect(screen.getByRole('button', { name: /Confirm placement/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Review updated costs' }));
  expect(screen.getByRole('button', { name: /Confirm placement/ })).toBeEnabled();
});

it('keeps a fresh confirmation during unchanged polling but invalidates it after a loading-to-ready revision change', () => {
  const wire = freshWire04(); Object.assign(wire, { food: 1000n, wood: 1000n, stone: 1000n, gold: 1000n });
  const { snapshot, rerender } = setup(wire); openMill();
  rerender({ ...snapshot, phase: 'loading' }); rerender(snapshot);
  expect(screen.getByRole('button', { name: /Confirm placement/ })).toBeEnabled();
  rerender({ ...snapshot, phase: 'loading' }); wire.revision = 2n;
  rerender({ ...snapshot, view: presentState04(decodeState04(wire, SCOPE04), ATLAS04, Date.now()) });
  expect(screen.getByRole('button', { name: /Confirm placement/ })).toBeDisabled();
  expect(screen.getByText('Review updated costs and confirm again')).toBeVisible();
});

it('cancels a draft without a gameplay command and keeps keyboard focus on a visible control', () => {
  const { controller } = setup(); openMill();
  const cancel = screen.getByRole('button', { name: 'Cancel draft · free' }); cancel.focus(); fireEvent.click(cancel);
  expect(screen.queryByRole('button', { name: /Confirm placement/ })).not.toBeInTheDocument();
  expect(controller.submit).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Close panel' })).toHaveFocus();
});

it('prevents building with missing atlas authority even when funds and placement are valid', () => {
  const wire = freshWire04(); Object.assign(wire, { food: 1000n, wood: 1000n, stone: 1000n, gold: 1000n });
  const { snapshot, rerender, controller } = setup(wire);
  rerender({ ...snapshot, view: { ...snapshot.view!, atlas: null } }); openMill();
  expect(screen.getByRole('button', { name: /Confirm placement/ })).toBeDisabled(); expect(controller.submit).not.toHaveBeenCalled();
});

it('recovers every repeated same-revision rejection with a separate explicit review and confirmation', () => {
  const wire = freshWire04(); Object.assign(wire, { food: 1000n, wood: 1000n, stone: 1000n, gold: 1000n });
  const { snapshot, controller, rerender } = setup(wire); openMill();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm placement' }));
  expect(controller.submit).toHaveBeenCalledTimes(1);
  for (let rejectedAttempt = 1; rejectedAttempt <= 2; rejectedAttempt++) {
    // Local stale capture can go straight to loading; a repeated reconfirm
    // problem need not clear and the authoritative revision can stay at one.
    rerender({ ...snapshot, phase: 'loading', problem: 'reconfirm' });
    expect(screen.queryByRole('button', { name: 'Review updated costs' })).not.toBeInTheDocument();
    rerender({ ...snapshot, phase: 'ready', problem: 'reconfirm' });
    expect(screen.getByText('Review updated costs and confirm again')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm placement' })).toBeDisabled();
    expect(controller.submit).toHaveBeenCalledTimes(rejectedAttempt);
    fireEvent.click(screen.getByRole('button', { name: 'Review updated costs' }));
    expect(controller.submit).toHaveBeenCalledTimes(rejectedAttempt);
    // An unchanged background poll after review is not a new rejection.
    rerender({ ...snapshot, phase: 'loading', problem: 'reconfirm' });
    rerender({ ...snapshot, phase: 'ready', problem: 'reconfirm' });
    const confirm = screen.getByRole('button', { name: 'Confirm placement' });
    expect(confirm).toBeEnabled(); fireEvent.click(confirm); fireEvent.click(confirm);
    expect(controller.submit).toHaveBeenCalledTimes(rejectedAttempt + 1);
  }
  for (const [intent] of vi.mocked(controller.submit).mock.calls) {
    expect(intent.kind).toBe('build');
    if (intent.kind === 'build') {
      expect(Object.isFrozen(intent.quote)).toBe(true); expect(intent.quote.revision).toBe(1n);
      expect(intent.quote.cost).toEqual({ food: 20n, wood: 40n, stone: 20n, gold: 0n });
    }
  }
});
