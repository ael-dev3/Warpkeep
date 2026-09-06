import { GAMEPLAY04_POLICY_VERSION } from '../../../spacetimedb/gameplay04/policy';
import type { PtrGameplay04Capability } from '../ptrRealmConnection';
import { decodeState04 } from './gameplay04State';
import { presentState04, quoteBuilding04, type View04 } from './gameplay04Presentation';
import { Gameplay04ClientError } from './ptrGameplay04Errors';
import type { Atlas04, Intent04, Mutation04, ResultWire04 } from './ptrGameplay04Types';

export type Snapshot04 = Readonly<{
  phase: 'loading' | 'uninitialized' | 'ready' | 'pending' | 'uncertain' | 'failed' | 'disposed';
  view: View04 | null;
  problem: 'none' | 'reconfirm' | 'capacity' | 'target' | 'authority' | 'unknown' | 'invalid-state';
}>;
export type Controller04 = Readonly<{
  getSnapshot: () => Snapshot04;
  subscribe: (listener: () => void) => () => void;
  refresh: () => Promise<void>;
  setAtlas: (atlas: Atlas04 | null) => void;
  submit: (intent: Intent04) => Promise<void>;
  retryPending: () => Promise<void>;
  dispose: () => void;
}>;

const U64_MAX = (1n << 64n) - 1n;
function invalid(): never { throw new Gameplay04ClientError('invalid-state'); }
function rejected(): never { throw new Gameplay04ClientError('rejected'); }
function positiveU64(value: unknown): value is bigint {
  return typeof value === 'bigint' && value > 0n && value <= U64_MAX;
}

// A receipt describes this captured request, not the most recently observed keep.
// Closed data descriptors also prevent a malformed response from executing getters.
function receipt(value: unknown, command: Mutation04): ResultWire04 {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid();
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) invalid();
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 2 || !keys.includes('sequence') || !keys.includes('revision')) invalid();
    const sequence = Object.getOwnPropertyDescriptor(value, 'sequence');
    const revision = Object.getOwnPropertyDescriptor(value, 'revision');
    if (!sequence || !revision || !('value' in sequence) || !('value' in revision)
      || !positiveU64(sequence.value) || !positiveU64(revision.value)
      || sequence.value !== command.input.sequence
      || revision.value !== command.input.expectedRevision + 1n) invalid();
    return Object.freeze({ sequence: sequence.value, revision: revision.value });
  } catch { return invalid(); }
}

export function createGameplay04Controller(options: Readonly<{
  capability: PtrGameplay04Capability; nonce: () => string; now: () => number;
}>): Controller04 {
  const { capability, nonce, now } = options;
  const listeners = new Set<() => void>();
  const abort = new AbortController();
  let life = 0;
  let disposed = false;
  let busy: 'read' | 'mutate' | null = null;
  let reading: Promise<void> | null = null;
  let atlas: Atlas04 | null = null;
  // Never publish, persist, regenerate, or transfer this envelope to a new session.
  let pending: Mutation04 | null = null;
  let confirmed: ResultWire04 | null = null;
  let snapshot: Snapshot04 = Object.freeze({ phase: 'loading', view: null, problem: 'none' });

  function publish(phase: Snapshot04['phase'], problem = snapshot.problem, view = snapshot.view) {
    snapshot = Object.freeze({ phase, problem, view });
    for (const listener of listeners) listener();
  }
  function invalidate(problem: 'none' | 'authority') {
    if (disposed) return;
    disposed = true; life += 1; pending = null; confirmed = null; atlas = null;
    abort.abort(); publish('disposed', problem, null);
    listeners.clear();
  }
  function live(capturedLife = life): boolean {
    if (disposed || capturedLife !== life) return false;
    if (!capability.isCurrent()) { invalidate('authority'); return false; }
    return true;
  }
  function errorKind(error: unknown) {
    return error instanceof Gameplay04ClientError ? error : new Gameplay04ClientError('uncertain');
  }
  function rejectionProblem(error: Gameplay04ClientError): Snapshot04['problem'] {
    if (error.code === 'GAMEPLAY04_LOCATION_FULL') return 'capacity';
    if (error.code === 'GAMEPLAY04_TARGET_INVALID') return 'target';
    return 'reconfirm';
  }
  function retainRejection(fallback: Snapshot04['problem']): Snapshot04['problem'] {
    return ['reconfirm', 'capacity', 'target'].includes(snapshot.problem) ? snapshot.problem : fallback;
  }

  async function readAuthoritative(capturedLife: number) {
    if (!live(capturedLife)) return;
    try {
      const wire = await capability.read(abort.signal);
      if (!live(capturedLife)) return;
      const state = decodeState04(wire, capability.scope);
      const previous = snapshot.view?.state;
      if ((previous && (state.revision < previous.revision || state.lastAcceptedSequence < previous.lastAcceptedSequence))
        || (confirmed && (state.revision < confirmed.revision || state.lastAcceptedSequence < confirmed.sequence))) invalid();
      const view = presentState04(state, atlas, now());
      if (!live(capturedLife)) return;
      if (confirmed) { pending = null; confirmed = null; }
      // An advanced sequence does not establish whose request consumed it.
      publish(pending ? 'uncertain' : 'ready', pending ? 'unknown' : retainRejection('none'), view);
    } catch (error) {
      if (!live(capturedLife)) return;
      const failure = errorKind(error);
      if (failure.kind === 'authority') { invalidate('authority'); return; }
      if (failure.kind === 'not-initialized' && !pending && !snapshot.view) {
        publish('uninitialized', retainRejection('none'), null); return;
      }
      publish(pending && !confirmed ? 'uncertain' : 'failed',
        failure.kind === 'invalid-state' || failure.kind === 'not-initialized' ? 'invalid-state' : retainRejection('unknown'));
    }
  }

  function refresh(): Promise<void> {
    if (!live()) return Promise.resolve();
    if (busy) return busy === 'read' ? reading ?? Promise.resolve() : Promise.resolve();
    const capturedLife = life;
    busy = 'read';
    publish(pending && !confirmed ? 'uncertain' : 'loading');
    reading = readAuthoritative(capturedLife).finally(() => {
      if (capturedLife === life) { busy = null; reading = null; }
    });
    return reading;
  }

  function capture(intent: Intent04): Mutation04 {
    const view = snapshot.view;
    const initialize = intent.kind === 'initialize';
    if (initialize ? snapshot.phase !== 'uninitialized' : snapshot.phase !== 'ready' || !view) rejected();
    const sequence = initialize ? 1n : view!.state.lastAcceptedSequence + 1n;
    const expectedRevision = initialize ? 0n : view!.state.revision;
    if (!positiveU64(sequence) || expectedRevision >= U64_MAX) invalid();
    const suffix = nonce();
    if (typeof suffix !== 'string' || suffix.length !== 32 || !/^[0-9a-f]{32}$/.test(suffix)) invalid();
    const base = { sequence, expectedRevision, requestKey: `g04:${sequence}:${suffix}`, policyVersion: GAMEPLAY04_POLICY_VERSION };
    if (initialize) return Object.freeze({ kind: 'initialize', input: Object.freeze(base) });
    if (!atlas) rejected();
    const expectedAtlasRevision = atlas.revision;
    if (intent.kind === 'build') {
      const q = intent.quote;
      let fresh;
      try { fresh = quoteBuilding04(view!, q.kind, q.placement); } catch { return rejected(); }
      if (q.revision !== fresh.revision || q.atlasRevision !== fresh.atlasRevision
        || q.policyVersion !== fresh.policyVersion || q.layoutDigest !== fresh.layoutDigest
        || q.targetLevel !== fresh.targetLevel || q.durationMicros !== fresh.durationMicros
        || q.placement.kind !== fresh.placement.kind || q.placement.x !== fresh.placement.x
        || q.placement.z !== fresh.placement.z || q.placement.rotation !== fresh.placement.rotation
        || (['food', 'wood', 'stone', 'gold'] as const).some(key => q.cost[key] !== fresh.cost[key])) rejected();
      return Object.freeze({ kind: 'build', input: Object.freeze({ ...base, expectedAtlasRevision,
        layoutDigest: q.layoutDigest, kind: q.kind, targetLevel: q.targetLevel,
        x: q.placement.x, z: q.placement.z, rotation: q.placement.rotation,
        expectedCost: Object.freeze({ food: q.cost.food, wood: q.cost.wood, stone: q.cost.stone, gold: q.cost.gold }),
        expectedDurationMicros: q.durationMicros,
      }) });
    }
    if (!Number.isInteger(intent.workerOrdinal) || intent.workerOrdinal < 0 || intent.workerOrdinal > 3) rejected();
    if (intent.kind === 'recall') {
      if (intent.atlasRevision !== expectedAtlasRevision) rejected();
      return Object.freeze({ kind: 'recall', input: Object.freeze({ ...base, expectedAtlasRevision, workerOrdinal: intent.workerOrdinal }) });
    }
    if (intent.target.atlasId !== atlas.atlasId || intent.target.revision !== expectedAtlasRevision) rejected();
    return Object.freeze({ kind: 'dispatch', input: Object.freeze({ ...base, expectedAtlasRevision,
      workerOrdinal: intent.workerOrdinal, locationId: intent.target.locationId,
      resource: intent.target.resource, gatheringDurationMicros: intent.durationMicros,
    }) });
  }

  async function sendPending(capturedLife: number) {
    const command = pending;
    if (!command || confirmed || !live(capturedLife)) return;
    busy = 'mutate'; publish('pending', 'none');
    try {
      if (!live(capturedLife)) return;
      const result = await capability.mutate(command, abort.signal);
      if (!live(capturedLife)) return;
      confirmed = receipt(result, command);
      await readAuthoritative(capturedLife);
      if (!live(capturedLife)) return;
    } catch (error) {
      if (!live(capturedLife)) return;
      const failure = errorKind(error);
      if (failure.kind === 'authority') { invalidate('authority'); return; }
      if (failure.kind === 'rejected' || failure.kind === 'not-initialized') {
        pending = null; confirmed = null;
        publish('loading', rejectionProblem(failure));
        await readAuthoritative(capturedLife);
        if (!live(capturedLife)) return;
      } else publish('uncertain', failure.kind === 'invalid-state' ? 'invalid-state' : 'unknown');
    } finally {
      if (capturedLife === life) busy = null;
    }
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (!disposed) listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    refresh,
    setAtlas(value) {
      if (!live()) return;
      atlas = value === null ? null : Object.freeze({ atlasId: value.atlasId, revision: value.revision });
      if (snapshot.view) publish(snapshot.phase, snapshot.problem, presentState04(snapshot.view.state, atlas, snapshot.view.receivedAtMs));
    },
    async submit(intent) {
      if (!live() || busy || pending || (snapshot.phase !== 'ready' && snapshot.phase !== 'uninitialized')) return;
      const capturedLife = life;
      try { pending = capture(intent); }
      catch (error) {
        if (!live(capturedLife)) return;
        const failure = errorKind(error);
        if (failure.kind === 'rejected') {
          // The rejected intent stays unsent: refresh, then require a new confirmation.
          publish('loading', 'reconfirm');
          await refresh();
          if (!live(capturedLife)) return;
        } else publish('failed', 'invalid-state');
        return;
      }
      await sendPending(capturedLife);
    },
    async retryPending() {
      if (!live() || busy || !pending || confirmed) return;
      await sendPending(life);
    },
    dispose: () => invalidate('none'),
  });
}
