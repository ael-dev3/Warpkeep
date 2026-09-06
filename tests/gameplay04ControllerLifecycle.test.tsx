import { StrictMode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGameplay04Controller } from '../src/ptr/gameplay04/useGameplay04Controller';
import type { PtrGameplay04Capability } from '../src/ptr/ptrRealmConnection';
import { freshWire04, scriptedCapability04 } from './fixtures/gameplay04Client';

let latest: ReturnType<typeof useGameplay04Controller>;
function Harness({ capability, surface = 'keep' }: { capability: PtrGameplay04Capability; surface?: string }) {
  latest = useGameplay04Controller(capability);
  return <output>{surface}:{latest.snapshot.phase}</output>;
}
async function flush() { await act(async () => {}); }
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible'); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('reads on entry, retains the controller across navigation, polls only while visible and refreshes on return/focus', async () => {
  const { capability, read } = scriptedCapability04();
  const rendered = render(<Harness capability={capability} />); await flush();
  const original = latest.controller;
  expect(latest.snapshot.phase).toBe('ready'); expect(read).toHaveBeenCalledTimes(1);
  rendered.rerender(<Harness capability={capability} surface="world" />); await flush();
  expect(latest.controller).toBe(original);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); expect(read).toHaveBeenCalledTimes(2);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); }); expect(read).toHaveBeenCalledTimes(2);
  act(() => { window.dispatchEvent(new Event('focus')); }); await flush(); expect(read).toHaveBeenCalledTimes(2);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  act(() => { document.dispatchEvent(new Event('visibilitychange')); }); await flush(); expect(read).toHaveBeenCalledTimes(3);
  act(() => { window.dispatchEvent(new Event('focus')); }); await flush(); expect(read).toHaveBeenCalledTimes(4);
  rendered.unmount(); await flush();
  expect(original.getSnapshot().phase).toBe('disposed');
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); }); expect(read).toHaveBeenCalledTimes(4);
});

it('never overlaps slow polls or focus reads', async () => {
  const { capability, read } = scriptedCapability04();
  let resolve!: (value: ReturnType<typeof freshWire04>) => void;
  read.mockReturnValueOnce(new Promise(yes => { resolve = yes; }));
  render(<Harness capability={capability} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); window.dispatchEvent(new Event('focus')); });
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(freshWire04()); }); expect(latest.snapshot.phase).toBe('ready');
});

it('replaces and disposes the old capability controller without carrying an uncertain request', async () => {
  const first = scriptedCapability04();
  const rendered = render(<Harness capability={first.capability} />); await flush();
  const old = latest.controller;
  await act(async () => { old.setAtlas({ atlasId: 'test', revision: 1n });
    first.mutate.mockRejectedValueOnce(new Error('lost response'));
    await old.submit({ kind: 'recall', workerOrdinal: 0, atlasRevision: 1n }); });
  expect(old.getSnapshot().phase).toBe('uncertain');
  const second = scriptedCapability04();
  rendered.rerender(<Harness capability={second.capability} />); await flush();
  expect(old.getSnapshot()).toMatchObject({ phase: 'disposed', view: null });
  expect(latest.controller).not.toBe(old); expect(latest.snapshot.phase).toBe('ready');
  await latest.controller.retryPending(); expect(second.mutate).not.toHaveBeenCalled(); expect(second.read).toHaveBeenCalledTimes(1);
});

it('survives StrictMode effect replay and invalidates expired authority on the next poll', async () => {
  const scripted = scriptedCapability04();
  render(<StrictMode><Harness capability={scripted.capability} /></StrictMode>); await flush();
  expect(latest.snapshot.phase).toBe('ready');
  scripted.expire();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(latest.snapshot).toEqual({ phase: 'disposed', view: null, problem: 'authority' });
});

it('uses 16 crypto bytes with fixed lowercase zero-padded hex and never polls during a mutation', async () => {
  const scripted = scriptedCapability04();
  const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation(value => {
    (value as Uint8Array).set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 254, 255]);
    return value;
  });
  render(<Harness capability={scripted.capability} />); await flush();
  let reject!: (error: unknown) => void;
  scripted.mutate.mockReturnValueOnce(new Promise((_, no) => { reject = no; }));
  let work!: Promise<void>;
  act(() => {
    latest.controller.setAtlas({ atlasId: 'test', revision: 1n });
    work = latest.controller.submit({ kind: 'recall', workerOrdinal: 0, atlasRevision: 1n });
  });
  expect(random).toHaveBeenCalledTimes(1);
  expect((random.mock.calls[0][0] as Uint8Array).byteLength).toBe(16);
  expect(scripted.mutate.mock.calls[0][0].input.requestKey).toBe('g04:2:000102030405060708090a0b0c0dfeff');
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); window.dispatchEvent(new Event('focus')); });
  expect(scripted.read).toHaveBeenCalledTimes(1); expect(latest.snapshot.phase).toBe('pending');
  await act(async () => { reject(new Error('unknown')); await work; });
  expect(latest.snapshot.phase).toBe('uncertain');
});
