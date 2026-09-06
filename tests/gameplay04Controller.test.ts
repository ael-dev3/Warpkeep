import { describe, expect, it, vi } from 'vitest';
import { createGameplay04Controller } from '../src/ptr/gameplay04/createGameplay04Controller';
import { Gameplay04ClientError } from '../src/ptr/gameplay04/ptrGameplay04Errors';
import { quoteBuilding04 } from '../src/ptr/gameplay04/gameplay04Presentation';
import type { Intent04, ReadWire04, ResultWire04 } from '../src/ptr/gameplay04/ptrGameplay04Types';
import { assignmentWire04, constructingWire04, expectDeepFrozen04, freshWire04, MILL_PLACEMENT04, scriptedCapability04 } from './fixtures/gameplay04Client';

const atlas = { atlasId: 'atlas-test', revision: 1n };
const dispatch: Intent04 = { kind: 'dispatch', workerOrdinal: 0,
  target: { ...atlas, locationId: 'resource-test', resource: 'wood', q: 1, r: 0 }, durationMicros: 60_000_000n };
const nonce = () => 'b'.repeat(32);
const uncertain = () => new Gameplay04ClientError('uncertain');
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function acceptedWire(revision = 2n, sequence = 2n) {
  const wire = freshWire04();
  wire.revision = revision; wire.lastAcceptedSequence = sequence;
  wire.workers[0].assignmentRevision = 1n;
  wire.workers[0].assignment = { ...assignmentWire04(), locationId: 'resource-test', resource: 'wood' };
  return wire;
}
async function setup() {
  const scripted = scriptedCapability04();
  const controller = createGameplay04Controller({ capability: scripted.capability, nonce, now: () => 1000 });
  await controller.refresh(); controller.setAtlas(atlas);
  return { ...scripted, controller };
}

describe('authoritative gameplay controller', () => {
  it('replays the exact immutable captured request, never publishing the request key', async () => {
    const { controller, mutate, read } = await setup();
    mutate.mockRejectedValueOnce(uncertain());
    read.mockResolvedValueOnce(acceptedWire());
    await controller.submit(dispatch);
    const first = mutate.mock.calls[0][0];
    expect(controller.getSnapshot().phase).toBe('uncertain');
    expect(first.input.requestKey).toBe('g04:2:' + 'b'.repeat(32));
    expect(expectDeepFrozen04(first)).toBe(true);
    expect(JSON.stringify(controller.getSnapshot(), (_, v) => typeof v === 'bigint' ? String(v) : v)).not.toContain(first.input.requestKey);
    await controller.retryPending();
    expect(mutate.mock.calls[1][0]).toBe(first);
    expect(controller.getSnapshot().phase).toBe('ready');
    expect(controller.getSnapshot().view?.workers[0].phase).toBe('outbound');
    expect(controller.getSnapshot().view?.balances.wood).toBe(0n);
  });

  it('deduplicates button clicks and prevents reads during mutation', async () => {
    const { controller, mutate, read } = await setup();
    const pending = deferred<ResultWire04>(); mutate.mockReturnValueOnce(pending.promise);
    read.mockResolvedValueOnce(acceptedWire());
    const first = controller.submit(dispatch);
    await controller.submit(dispatch); await controller.retryPending(); await controller.refresh();
    expect(mutate).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(1);
    pending.resolve({ sequence: 2n, revision: 2n }); await first;
    expect(read).toHaveBeenCalledTimes(2); expect(controller.getSnapshot().phase).toBe('ready');
  });

  it('deduplicates overlapping reads and disallows submitting against an in-flight refresh', async () => {
    const { controller, read, mutate } = await setup();
    const pending = deferred<ReadWire04>(); read.mockReturnValueOnce(pending.promise);
    const first = controller.refresh(); const second = controller.refresh();
    await controller.submit(dispatch);
    expect(read).toHaveBeenCalledTimes(2); expect(mutate).not.toHaveBeenCalled();
    pending.resolve(freshWire04()); await Promise.all([first, second]);
    expect(controller.getSnapshot().phase).toBe('ready');
  });

  it('keeps an ambiguous envelope despite another tab advancing sequence and accepts an older replay receipt', async () => {
    const { controller, mutate, read } = await setup();
    mutate.mockRejectedValueOnce(uncertain());
    await controller.submit(dispatch);
    read.mockResolvedValue(acceptedWire(5n, 4n)); await controller.refresh();
    expect(controller.getSnapshot().phase).toBe('uncertain');
    await controller.submit(dispatch); expect(mutate).toHaveBeenCalledTimes(1);
    await controller.retryPending();
    expect(mutate.mock.calls[1][0]).toBe(mutate.mock.calls[0][0]);
    expect(controller.getSnapshot().phase).toBe('ready');
    expect(controller.getSnapshot().view?.state.revision).toBe(5n);
  });

  it('resolves a two-tab sequence collision only on exact replay rejection', async () => {
    const { controller, mutate, read } = await setup();
    mutate.mockRejectedValueOnce(uncertain()); await controller.submit(dispatch);
    read.mockResolvedValue({ ...freshWire04(), revision: 2n, lastAcceptedSequence: 2n }); await controller.refresh();
    expect(controller.getSnapshot().phase).toBe('uncertain');
    mutate.mockRejectedValueOnce(new Gameplay04ClientError('rejected', 'GAMEPLAY04_RECEIPT_CONFLICT'));
    await controller.retryPending();
    expect(mutate.mock.calls[1][0]).toBe(mutate.mock.calls[0][0]);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'ready', problem: 'reconfirm' });
    expect(controller.getSnapshot().view?.workers[0].phase).toBe('idle');
    await controller.retryPending(); expect(mutate).toHaveBeenCalledTimes(2);
  });

  it('does not replay a confirmed command when the authoritative follow-up read fails', async () => {
    const { controller, mutate, read } = await setup();
    read.mockRejectedValueOnce(uncertain());
    await controller.submit(dispatch);
    expect(controller.getSnapshot().phase).toBe('failed');
    await controller.retryPending(); await controller.submit(dispatch);
    expect(mutate).toHaveBeenCalledTimes(1);
    read.mockResolvedValueOnce(acceptedWire()); await controller.refresh();
    expect(controller.getSnapshot().phase).toBe('ready');
  });

  it.each([
    ['GAMEPLAY04_RECEIPT_CONFLICT', 'reconfirm'], ['GAMEPLAY04_SEQUENCE_INVALID', 'reconfirm'],
    ['GAMEPLAY04_INPUT_INVALID', 'reconfirm'], ['GAMEPLAY04_LOCATION_FULL', 'capacity'], ['GAMEPLAY04_TARGET_INVALID', 'target'],
  ] as const)('refreshes after definitive %s without automatic resubmission', async (code, problem) => {
    const { controller, mutate, read } = await setup();
    mutate.mockRejectedValueOnce(new Gameplay04ClientError('rejected', code));
    read.mockResolvedValueOnce(acceptedWire(3n, 2n));
    await controller.submit(dispatch); await controller.retryPending();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'ready', problem });
    expect(read).toHaveBeenCalledTimes(2); expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('keeps the definitive rejection explanation through a failed follow-up read', async () => {
    const { controller, mutate, read } = await setup();
    mutate.mockRejectedValueOnce(new Gameplay04ClientError('rejected', 'GAMEPLAY04_INPUT_INVALID'));
    read.mockRejectedValueOnce(uncertain()); await controller.submit(dispatch);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', problem: 'reconfirm' });
    await controller.retryPending(); expect(mutate).toHaveBeenCalledTimes(1);
    await controller.refresh(); expect(controller.getSnapshot()).toMatchObject({ phase: 'ready', problem: 'reconfirm' });
  });

  it.each([{}, { sequence: 3n, revision: 2n }, { sequence: 2n, revision: 1n },
    { sequence: 2n, revision: 1n << 64n }, { sequence: 2n, revision: 3n }, { sequence: 2n, revision: '2' },
    { sequence: 2n, revision: 2n, requestKey: 'leak' }])('keeps malformed receipt case %# ambiguous', async result => {
    const { controller, mutate } = await setup();
    mutate.mockResolvedValueOnce(result as ResultWire04);
    await controller.submit(dispatch);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'uncertain', problem: 'invalid-state' });
    await controller.submit(dispatch); expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('does not invoke receipt getters and retains the exact retry after malformed delivery', async () => {
    const { controller, mutate, read } = await setup();
    const getter = vi.fn(() => 2n);
    mutate.mockResolvedValueOnce(Object.defineProperty({ sequence: 2n }, 'revision', { enumerable: true, get: getter }) as ResultWire04);
    await controller.submit(dispatch); expect(getter).not.toHaveBeenCalled();
    expect(controller.getSnapshot().phase).toBe('uncertain');
    read.mockResolvedValueOnce(acceptedWire()); await controller.retryPending();
    expect(mutate.mock.calls[1][0]).toBe(mutate.mock.calls[0][0]);
    expect(controller.getSnapshot().phase).toBe('ready');
  });

  it('does not interpret exceptions from malformed receipt reflection as definitive transport rejection', async () => {
    const { controller, mutate, read } = await setup();
    mutate.mockResolvedValueOnce(new Proxy({ sequence: 2n, revision: 2n }, {
      ownKeys() { throw new Gameplay04ClientError('rejected', 'GAMEPLAY04_RECEIPT_CONFLICT'); },
    }));
    await controller.submit(dispatch);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'uncertain', problem: 'invalid-state' });
    read.mockResolvedValueOnce(acceptedWire()); await controller.retryPending();
    expect(mutate.mock.calls[1][0]).toBe(mutate.mock.calls[0][0]);
    expect(controller.getSnapshot().phase).toBe('ready');
  });

  it('rejects regressing authoritative reads after a receipt and then recovers by reading', async () => {
    const { controller, read, mutate } = await setup();
    await controller.submit(dispatch); // Default read is revision one, below receipt two.
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', problem: 'invalid-state' });
    read.mockResolvedValueOnce(acceptedWire()); await controller.refresh();
    expect(controller.getSnapshot().phase).toBe('ready'); expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('only exact not-initialized exposes initialization, capturing policy and sequence one', async () => {
    const { capability, read, mutate } = scriptedCapability04();
    const controller = createGameplay04Controller({ capability, nonce, now: () => 1000 });
    await controller.submit({ kind: 'initialize' }); expect(mutate).not.toHaveBeenCalled();
    read.mockRejectedValueOnce(new Error('GAMEPLAY04_NOT_INITIALIZED')); await controller.refresh();
    expect(controller.getSnapshot().phase).toBe('failed');
    await controller.submit({ kind: 'initialize' }); expect(mutate).not.toHaveBeenCalled();
    read.mockRejectedValueOnce(new Gameplay04ClientError('not-initialized')); await controller.refresh();
    expect(controller.getSnapshot().phase).toBe('uninitialized');
    mutate.mockResolvedValueOnce({ sequence: 1n, revision: 1n });
    await controller.submit({ kind: 'initialize' });
    expect(mutate.mock.calls[0][0]).toEqual({ kind: 'initialize', input: { sequence: 1n, expectedRevision: 0n,
      requestKey: 'g04:1:' + 'b'.repeat(32), policyVersion: freshWire04().policyVersion } });
    expect(controller.getSnapshot().phase).toBe('ready');
  });

  it('refreshes a rejected initialization instead of seeding or retrying', async () => {
    const { capability, read, mutate } = scriptedCapability04();
    const controller = createGameplay04Controller({ capability, nonce, now: () => 1000 });
    read.mockRejectedValueOnce(new Gameplay04ClientError('not-initialized')); await controller.refresh();
    mutate.mockRejectedValueOnce(new Gameplay04ClientError('rejected', 'GAMEPLAY04_ALREADY_INITIALIZED'));
    await controller.submit({ kind: 'initialize' }); await controller.retryPending();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'ready', problem: 'reconfirm' });
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('does not treat absence during ambiguous refresh as permission to initialize', async () => {
    const { controller, mutate, read } = await setup();
    mutate.mockRejectedValueOnce(uncertain()); await controller.submit(dispatch);
    read.mockRejectedValueOnce(new Gameplay04ClientError('not-initialized')); await controller.refresh();
    expect(controller.getSnapshot().phase).toBe('uncertain');
    await controller.submit({ kind: 'initialize' }); expect(mutate).toHaveBeenCalledTimes(1);
  });

  it.each(['B'.repeat(32), 'b'.repeat(31), 'b'.repeat(33), 'z'.repeat(32), 'b'.repeat(32) + '\n'])('rejects unsafe nonce %s before transport', async invalid => {
    const { capability, mutate } = scriptedCapability04();
    const controller = createGameplay04Controller({ capability, nonce: () => invalid, now: () => 1000 });
    await controller.refresh(); controller.setAtlas(atlas); await controller.submit(dispatch);
    expect(mutate).not.toHaveBeenCalled(); expect(controller.getSnapshot().phase).toBe('failed');
  });

  it('fails closed on sequence exhaustion', async () => {
    const { controller, mutate, read } = await setup();
    read.mockResolvedValueOnce({ ...freshWire04(), lastAcceptedSequence: (1n << 64n) - 1n });
    await controller.refresh(); await controller.submit(dispatch);
    expect(mutate).not.toHaveBeenCalled(); expect(controller.getSnapshot().phase).toBe('failed');
  });

  it('rejects stale quotes locally, preserves exact fresh build fields and copies mutable intent data', async () => {
    const { controller, mutate, read } = await setup();
    const quote = quoteBuilding04(controller.getSnapshot().view!, 'city-mill', MILL_PLACEMENT04);
    read.mockResolvedValueOnce({ ...freshWire04(), revision: 2n }); await controller.refresh();
    await controller.submit({ kind: 'build', quote });
    expect(mutate).not.toHaveBeenCalled(); expect(controller.getSnapshot().problem).toBe('reconfirm');
    const fresh = quoteBuilding04(controller.getSnapshot().view!, 'city-mill', MILL_PLACEMENT04);
    const cost = { ...fresh.cost };
    mutate.mockRejectedValueOnce(uncertain());
    await controller.submit({ kind: 'build', quote: { ...fresh, cost } }); cost.wood = 999n;
    expect(mutate.mock.calls[0][0]).toEqual({ kind: 'build', input: {
      sequence: 2n, expectedRevision: 2n, requestKey: 'g04:2:' + 'b'.repeat(32), policyVersion: fresh.policyVersion,
      expectedAtlasRevision: 1n, layoutDigest: fresh.layoutDigest, kind: 'city-mill', targetLevel: 1,
      x: -24_000_000n, z: -20_000_000n, rotation: 0,
      expectedCost: { food: 20n, wood: 40n, stone: 20n, gold: 0n }, expectedDurationMicros: 120_000_000n,
    } });
    expect(expectDeepFrozen04(mutate.mock.calls[0][0])).toBe(true);
  });

  it('requires the displayed atlas for dispatch and recall', async () => {
    const { controller, mutate } = await setup(); controller.setAtlas(null);
    await controller.submit(dispatch); expect(mutate).not.toHaveBeenCalled();
    controller.setAtlas(atlas); await controller.submit({ kind: 'recall', workerOrdinal: 0, atlasRevision: 2n });
    expect(mutate).not.toHaveBeenCalled();
    mutate.mockRejectedValueOnce(uncertain());
    await controller.submit({ kind: 'recall', workerOrdinal: 0, atlasRevision: 1n });
    expect(mutate.mock.calls[0][0]).toMatchObject({ kind: 'recall', input: { expectedAtlasRevision: 1n, expectedRevision: 1n, workerOrdinal: 0 } });
  });

  it.each(['read', 'mutate'] as const)('drops late %s and aborts delivery on dispose', async operation => {
    const { controller, read, mutate } = await setup();
    const pending = deferred<never>();
    (operation === 'read' ? read : mutate).mockReturnValueOnce(pending.promise);
    const work = operation === 'read' ? controller.refresh() : controller.submit(dispatch);
    const signal = operation === 'read' ? read.mock.calls[1][0] : mutate.mock.calls[0][1];
    controller.dispose(); expect(signal.aborted).toBe(true);
    pending.reject(uncertain()); await work;
    expect(controller.getSnapshot()).toEqual({ phase: 'disposed', view: null, problem: 'none' });
    await controller.retryPending(); await controller.refresh(); controller.setAtlas(atlas);
    expect(controller.getSnapshot().view).toBeNull();
  });

  it('discards successful late reads after disposal and does not notify former subscribers', async () => {
    const { controller, read } = await setup();
    const pending = deferred<ReadWire04>(); read.mockReturnValueOnce(pending.promise);
    const work = controller.refresh(); controller.dispose();
    const listener = vi.fn(); const unsubscribe = controller.subscribe(listener);
    pending.resolve(acceptedWire()); await work; unsubscribe();
    expect(listener).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toEqual({ phase: 'disposed', view: null, problem: 'none' });
  });

  it.each(['read', 'mutate'] as const)('retires typed authority failures from %s even before isCurrent changes', async operation => {
    const { controller, read, mutate } = await setup();
    (operation === 'read' ? read : mutate).mockRejectedValueOnce(new Gameplay04ClientError('authority'));
    if (operation === 'read') await controller.refresh(); else await controller.submit(dispatch);
    expect(controller.getSnapshot()).toEqual({ phase: 'disposed', view: null, problem: 'authority' });
  });

  it.each(['before-read', 'after-read', 'before-mutate', 'after-mutate'] as const)('hard-invalidates authority %s', async when => {
    const { controller, read, mutate, expire } = await setup();
    if (when.startsWith('before')) expire();
    else if (when === 'after-read') read.mockImplementationOnce(async () => { expire(); return freshWire04(); });
    else mutate.mockImplementationOnce(async () => { expire(); return { sequence: 2n, revision: 2n }; });
    if (when.endsWith('read')) await controller.refresh(); else await controller.submit(dispatch);
    expect(controller.getSnapshot()).toEqual({ phase: 'disposed', view: null, problem: 'authority' });
    await controller.retryPending();
    if (when === 'before-mutate') expect(mutate).not.toHaveBeenCalled();
    if (when === 'after-mutate') expect(read).toHaveBeenCalledTimes(1);
  });

  it('fails closed on malformed state and does not promote phases or balances on clock jumps', async () => {
    const { capability, read } = scriptedCapability04();
    const now = vi.fn(() => 1000);
    const controller = createGameplay04Controller({ capability, nonce, now });
    read.mockResolvedValueOnce({ ...freshWire04(), food: -1n }); await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', problem: 'invalid-state' });
    const wire = constructingWire04(); wire.workers = acceptedWire().workers; read.mockResolvedValue(wire);
    await controller.refresh(); now.mockReturnValue(9_999_999_999); await controller.refresh();
    expect(controller.getSnapshot().view).toMatchObject({ balances: { food: 0n, wood: 0n },
      buildings: [{ phase: 'constructing', completedLevel: 0 }], workers: [{ phase: 'outbound' }, {}, {}, {}] });
    now.mockReturnValue(-1000); await controller.refresh();
    expect(controller.getSnapshot().view?.buildings[0].phase).toBe('constructing');
  });
});
