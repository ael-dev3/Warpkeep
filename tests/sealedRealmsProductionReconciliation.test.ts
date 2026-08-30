import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createSealedRealmsProductionPrivateState,
} from '../scripts/sealed-realms-production-private-state.mjs';
import {
  SealedRealmsProductionReconciliationError,
  createSealedRealmsProductionPublicationReconciler,
} from '../scripts/sealed-realms-production-reconciliation.mjs';

const S = '1'.repeat(40);
const D = 'a'.repeat(64);

function codec(lane: 'g002' | 'ptr') {
  const digest = (value: unknown) => createHash('sha256')
    .update(`marker:${lane}\n${JSON.stringify(value)}\n`).digest('hex');
  return {
    createSealedRealmsPublicationPossiblySubmittedMarker: (input: Record<string, unknown>) => Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-publication-possibly-submitted-v1',
      ...input,
      submissionState: 'possibly-submitted',
    }),
    parseSealedRealmsPublicationPossiblySubmittedMarker: (bytes: Uint8Array) => {
      const source = Buffer.from(bytes).toString('utf8');
      const value = JSON.parse(source) as Record<string, unknown>;
      if (`${JSON.stringify(value)}\n` !== source || value.lane !== lane) throw new Error('invalid');
      return Object.freeze(value);
    },
    digestSealedRealmsPublicationPossiblySubmittedMarker: digest,
    createSealedRealmsPublicationMarkerReconciliation: (input: Record<string, unknown>) => Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-publication-marker-reconciliation-v1',
      lane,
      markerDigest: input.markerDigest,
      outcome: input.outcome,
      databaseIdentity: input.databaseIdentity,
      publicationReceiptDigest: input.publicationReceiptDigest,
      observationDigest: input.observationDigest,
      observedAt: input.observedAt,
    }),
  };
}

vi.mock('../scripts/genesis002-production-publisher.mjs', () => codec('g002'));
vi.mock('../scripts/ptr-production-publisher.mjs', () => codec('ptr'));

const createSealedRealmsPublicationPossiblySubmittedMarker =
  codec('g002').createSealedRealmsPublicationPossiblySubmittedMarker;

function fixture(testOnlyRace?: (phase: string, path: string) => void) {
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-sealed-realms-reconciliation-'));
  for (const root of [
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'audit', 'private'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'cache'),
  ]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  return {
    home,
    state: createSealedRealmsProductionPrivateState({
      reportedHome: home,
      testOnlyOwnerUid: statSync(home).uid,
      testOnlyFsync: () => {},
      testOnlyAllowPlatformMode: true,
      testOnlyRace,
    }),
    secondState: () => createSealedRealmsProductionPrivateState({
      reportedHome: home,
      testOnlyOwnerUid: statSync(home).uid,
      testOnlyFsync: () => {},
      testOnlyAllowPlatformMode: true,
    }),
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

function marker(confirmationDigest = D) {
  return createSealedRealmsPublicationPossiblySubmittedMarker({
    lane: 'g002',
    sourceCommit: S,
    databaseUri: 'https://maincloud.spacetimedb.com',
    alias: 'warpkeep-genesis-002',
    moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
    release: '0.4.0',
    artifactDigest: 'b'.repeat(64),
    toolchainDigest: 'c'.repeat(64),
    publishPlanDigest: 'd'.repeat(64),
    confirmationDigest,
    attemptNonce: 'e'.repeat(64),
    markedAt: '2026-08-30T00:00:00.000Z',
  });
}

describe('sealed-realms publication reconciliation', () => {
  it('persists a marker and consumes its confirmation before releasing publication', async () => {
    const local = fixture();
    try {
      const reconciler = createSealedRealmsProductionPublicationReconciler({
        privateState: local.state,
        lane: 'g002',
        postflight: () => ({
          outcome: 'no-effect',
          databaseIdentity: null,
          publicationReceiptDigest: null,
          observationDigest: '9'.repeat(64),
          observedAt: '2026-08-30T00:01:00.000Z',
        }),
      });
      const inspected = await reconciler.inspect({ marker: marker() });
      if (!('confirmation' in inspected)) throw new Error('expected live confirmation');
      const callback = vi.fn(async (_input: { confirmation: object }) => ({
        stdout: 'private child output',
      }));

      await expect(reconciler.apply({
        confirmation: inspected.confirmation,
        publish: callback,
      })).resolves.toEqual({ status: 'submitted' });
      expect(callback).toHaveBeenCalledTimes(1);
      const callbackConfirmation = callback.mock.calls[0]?.[0]?.confirmation;
      expect(callbackConfirmation).toBe(inspected.confirmation);
      expect(Object.keys(callbackConfirmation)).toEqual([]);
      expect(JSON.stringify(callback.mock.calls[0]?.[0])).not.toContain(D);
      await expect(reconciler.apply({
        confirmation: inspected.confirmation,
        publish: callback,
      })).rejects.toThrow(SealedRealmsProductionReconciliationError);
    } finally {
      local.cleanup();
    }
  });

  it.each(['consumed', 'reconciliation'] as const)(
    'fails closed for an orphan %s terminal record',
    async (directory) => {
      const local = fixture();
      try {
        const existing = marker();
        const markerDigest = codec('g002')
          .digestSealedRealmsPublicationPossiblySubmittedMarker(existing);
        local.state.write({
          root: 'runtime',
          relativePath: directory === 'consumed'
            ? `publication/g002/consumed/confirmation-${markerDigest}.json`
            : `publication/g002/reconciliation/marker-${markerDigest}.json`,
          bytes: Buffer.from('{"private":"sentinel"}\n', 'utf8'),
        });
        const reconciler = createSealedRealmsProductionPublicationReconciler({
          privateState: local.state,
          lane: 'g002',
          postflight: () => ({
            outcome: 'no-effect', databaseIdentity: null, publicationReceiptDigest: null,
            observationDigest: '9'.repeat(64), observedAt: '2026-08-30T00:01:00.000Z',
          }),
        });
        await expect(reconciler.inspect({ marker: existing }))
          .rejects.toThrow('SEALED_REALMS_RECONCILIATION_STATE_INVALID');
      } finally {
        local.cleanup();
      }
    },
  );

  it('reconciles a consumed marker on restart without reissuing an apply-capable confirmation', async () => {
    const local = fixture();
    try {
      const existing = marker();
      const markerDigest = codec('g002')
        .digestSealedRealmsPublicationPossiblySubmittedMarker(existing);
      local.state.write({
        root: 'runtime',
        relativePath: `publication/g002/markers/possibly-submitted-${markerDigest}.json`,
        bytes: Buffer.from(`${JSON.stringify(existing)}\n`, 'utf8'),
      });
      local.state.write({
        root: 'runtime',
        relativePath: `publication/g002/consumed/confirmation-${markerDigest}.json`,
        bytes: Buffer.from(`${JSON.stringify({
          schemaVersion: 1,
          profile: 'warpkeep-sealed-realms-publication-confirmation-consumed-v1',
          lane: 'g002',
          markerDigest,
          confirmationDigest: D,
          consumedAt: '2026-08-30T00:00:30.000Z',
        })}\n`, 'utf8'),
      });
      const restarted = createSealedRealmsProductionPublicationReconciler({
        privateState: local.state,
        lane: 'g002',
        postflight: () => ({
          outcome: 'no-effect', databaseIdentity: null, publicationReceiptDigest: null,
          observationDigest: '9'.repeat(64), observedAt: '2026-08-30T00:01:00.000Z',
        }),
      });
      await expect(restarted.inspect({ marker: marker('f'.repeat(64)) }))
        .resolves.toEqual({ status: 'reconciled' });
      await expect(restarted.inspect({ marker: marker('f'.repeat(64)) }))
        .resolves.toEqual(expect.objectContaining({ confirmation: expect.any(Object) }));
    } finally {
      local.cleanup();
    }
  });

  it('blocks a fresh confirmation until the exact marker has a terminal reconciliation', async () => {
    const local = fixture();
    try {
      const reconciler = createSealedRealmsProductionPublicationReconciler({
        privateState: local.state,
        lane: 'g002',
        postflight: () => ({
          outcome: 'no-effect',
          databaseIdentity: null,
          publicationReceiptDigest: null,
          observationDigest: '9'.repeat(64),
          observedAt: '2026-08-30T00:01:00.000Z',
        }),
      });
      const existing = marker();
      const inspected = await reconciler.inspect({ marker: existing });
      if (!('confirmation' in inspected)) throw new Error('expected live confirmation');
      await expect(reconciler.inspect({ marker: marker('f'.repeat(64)) }))
        .rejects.toThrow('SEALED_REALMS_RECONCILIATION_UNRESOLVED_MARKER');
      await expect(reconciler.reconcile({ confirmation: inspected.confirmation }))
        .resolves.toEqual({ status: 'reconciled' });
      const successor = await reconciler.inspect({ marker: marker('f'.repeat(64)) });
      expect('confirmation' in successor && successor.confirmation).toBeDefined();
    } finally {
      local.cleanup();
    }
  });

  it('never lets caller-supplied no-effect facts clear a possibly-submitted marker', async () => {
    const local = fixture();
    try {
      const reconciler = createSealedRealmsProductionPublicationReconciler({
        privateState: local.state,
        lane: 'g002',
        postflight: () => ({
          outcome: 'no-effect',
          databaseIdentity: null,
          publicationReceiptDigest: null,
          observationDigest: '9'.repeat(64),
          observedAt: '2026-08-30T00:01:00.000Z',
        }),
      });
      const existing = marker();
      await reconciler.inspect({ marker: existing });

      await expect(reconciler.reconcile({
        marker: existing,
        outcome: 'no-effect',
        databaseIdentity: null,
        publicationReceiptDigest: null,
        observationDigest: '9'.repeat(64),
        observedAt: '2026-08-30T00:01:00.000Z',
      } as never)).rejects.toThrow('SEALED_REALMS_RECONCILIATION_CONFIRMATION_INVALID');
      await expect(reconciler.inspect({ marker: marker('f'.repeat(64)) }))
        .rejects.toThrow('SEALED_REALMS_RECONCILIATION_UNRESOLVED_MARKER');
    } finally {
      local.cleanup();
    }
  });

  it('claims a live confirmation before its first await and invokes publication exactly once', async () => {
    const local = fixture();
    try {
      const postflight = vi.fn(async () => ({
        outcome: 'adopted' as const,
        databaseIdentity: '1'.repeat(64),
        publicationReceiptDigest: '2'.repeat(64),
        observationDigest: '3'.repeat(64),
        observedAt: '2026-08-30T00:01:00.000Z',
      }));
      const reconciler = createSealedRealmsProductionPublicationReconciler({
        privateState: local.state, lane: 'g002', postflight,
      });
      const inspected = await reconciler.inspect({ marker: marker() });
      if (!('confirmation' in inspected)) throw new Error('expected live confirmation');
      const publish = vi.fn(async () => undefined);
      const [first, second] = await Promise.allSettled([
        reconciler.apply({ confirmation: inspected.confirmation, publish }),
        reconciler.apply({ confirmation: inspected.confirmation, publish }),
      ]);
      expect(first.status).toBe('fulfilled');
      expect(second.status).toBe('rejected');
      expect(publish).toHaveBeenCalledTimes(1);
      expect(postflight).toHaveBeenCalledTimes(1);
      await expect(reconciler.inspect({ marker: marker('f'.repeat(64)) }))
        .rejects.toThrow('SEALED_REALMS_RECONCILIATION_ADOPTED_SEALED');
    } finally {
      local.cleanup();
    }
  });

  it('serializes two restarted reconcilers before postflight and terminal no-clobber write', async () => {
    const local = fixture();
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    try {
      const existing = marker();
      const markerDigest = codec('g002')
        .digestSealedRealmsPublicationPossiblySubmittedMarker(existing);
      local.state.write({
        root: 'runtime',
        relativePath: `publication/g002/markers/possibly-submitted-${markerDigest}.json`,
        bytes: Buffer.from(`${JSON.stringify(existing)}\n`, 'utf8'),
      });
      const firstPostflight = vi.fn(async () => {
        await blocked;
        return {
          outcome: 'no-effect' as const, databaseIdentity: null, publicationReceiptDigest: null,
          observationDigest: '9'.repeat(64), observedAt: '2026-08-30T00:01:00.000Z',
        };
      });
      const secondPostflight = vi.fn(async () => ({
        outcome: 'adopted' as const, databaseIdentity: '1'.repeat(64),
        publicationReceiptDigest: '2'.repeat(64), observationDigest: '3'.repeat(64),
        observedAt: '2026-08-30T00:01:00.000Z',
      }));
      const first = createSealedRealmsProductionPublicationReconciler({
        privateState: local.state, lane: 'g002', postflight: firstPostflight,
      });
      const second = createSealedRealmsProductionPublicationReconciler({
        privateState: local.state, lane: 'g002', postflight: secondPostflight,
      });
      const firstInspection = first.inspect({ marker: marker('f'.repeat(64)) });
      await vi.waitFor(() => expect(firstPostflight).toHaveBeenCalledTimes(1));
      await expect(second.inspect({ marker: marker('f'.repeat(64)) }))
        .rejects.toThrow('SEALED_REALMS_RECONCILIATION_BUSY');
      expect(secondPostflight).not.toHaveBeenCalled();
      release();
      await expect(firstInspection).resolves.toEqual({ status: 'reconciled' });
      const terminal = local.state.list({
        root: 'runtime', relativeDirectory: 'publication/g002/reconciliation',
      });
      expect(terminal).toEqual([`marker-${markerDigest}.json`]);
    } finally {
      release?.();
      local.cleanup();
    }
  });

  it('permanently fails closed when an independent adopted terminal wins a no-effect no-clobber race', async () => {
    const existing = marker();
    const markerDigest = codec('g002').digestSealedRealmsPublicationPossiblySubmittedMarker(existing);
    let inject = false;
    const adopted = {
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-publication-marker-reconciliation-v1',
      lane: 'g002', markerDigest, outcome: 'adopted', databaseIdentity: '1'.repeat(64),
      publicationReceiptDigest: '2'.repeat(64), observationDigest: '3'.repeat(64),
      observedAt: '2026-08-30T00:01:00.000Z',
    };
    const local = fixture((phase, path) => {
      if (inject && phase === 'write-before-open' && /[\\/]reconciliation[\\/]marker-[a-f0-9]{64}\.json$/u.test(path)) {
        inject = false;
        writeFileSync(path, `${JSON.stringify(adopted)}\n`, { mode: 0o600 });
        chmodSync(path, 0o600);
      }
    });
    try {
      local.state.write({
        root: 'runtime',
        relativePath: `publication/g002/markers/possibly-submitted-${markerDigest}.json`,
        bytes: Buffer.from(`${JSON.stringify(existing)}\n`),
      });
      const postflight = vi.fn(async () => ({
        outcome: 'no-effect' as const, databaseIdentity: null, publicationReceiptDigest: null,
        observationDigest: '9'.repeat(64), observedAt: '2026-08-30T00:01:00.000Z',
      }));
      const reconciler = createSealedRealmsProductionPublicationReconciler({
        privateState: local.state, lane: 'g002', postflight,
      });
      inject = true;
      await expect(reconciler.inspect({ marker: marker('f'.repeat(64)) }))
        .rejects.toThrow('SEALED_REALMS_RECONCILIATION_TERMINAL_CONFLICT');
      await expect(reconciler.inspect({ marker: marker('f'.repeat(64)) }))
        .rejects.toThrow('SEALED_REALMS_RECONCILIATION_TERMINAL_CONFLICT');
      expect(postflight).toHaveBeenCalledTimes(1);
      expect(local.state.list({ root: 'runtime', relativeDirectory: 'publication/g002/markers' }))
        .toEqual([`possibly-submitted-${markerDigest}.json`]);
    } finally { local.cleanup(); }
  });

  it.each(['no-effect', 'adopted'] as const)(
    'durably claims before %s postflight across distinct private-state capabilities and restart',
    async winner => {
      const local = fixture();
      let release!: () => void;
      const blocked = new Promise<void>(resolve => { release = resolve; });
      try {
        const existing = marker();
        const markerDigest = codec('g002').digestSealedRealmsPublicationPossiblySubmittedMarker(existing);
        local.state.write({
          root: 'runtime',
          relativePath: `publication/g002/markers/possibly-submitted-${markerDigest}.json`,
          bytes: Buffer.from(`${JSON.stringify(existing)}\n`),
        });
        const firstPostflight = vi.fn(async () => {
          await blocked;
          return winner === 'adopted'
            ? { outcome: 'adopted' as const, databaseIdentity: '1'.repeat(64), publicationReceiptDigest: '2'.repeat(64), observationDigest: '3'.repeat(64), observedAt: '2026-08-30T00:01:00.000Z' }
            : { outcome: 'no-effect' as const, databaseIdentity: null, publicationReceiptDigest: null, observationDigest: '9'.repeat(64), observedAt: '2026-08-30T00:01:00.000Z' };
        });
        const losingPostflight = vi.fn(async () => winner === 'adopted'
          ? { outcome: 'no-effect' as const, databaseIdentity: null, publicationReceiptDigest: null, observationDigest: '8'.repeat(64), observedAt: '2026-08-30T00:01:01.000Z' }
          : { outcome: 'adopted' as const, databaseIdentity: '4'.repeat(64), publicationReceiptDigest: '5'.repeat(64), observationDigest: '6'.repeat(64), observedAt: '2026-08-30T00:01:01.000Z' });
        const first = createSealedRealmsProductionPublicationReconciler({ privateState: local.state, lane: 'g002', postflight: firstPostflight });
        const independent = createSealedRealmsProductionPublicationReconciler({ privateState: local.secondState(), lane: 'g002', postflight: losingPostflight });
        const active = first.inspect({ marker: marker('f'.repeat(64)) });
        await vi.waitFor(() => expect(firstPostflight).toHaveBeenCalledTimes(1));
        await expect(independent.inspect({ marker: marker('f'.repeat(64)) }))
          .rejects.toThrow('SEALED_REALMS_RECONCILIATION_BUSY');
        expect(losingPostflight).not.toHaveBeenCalled();
        release();
        if (winner === 'adopted') {
          await expect(active).rejects.toThrow('SEALED_REALMS_RECONCILIATION_ADOPTED_SEALED');
        } else {
          await expect(active).resolves.toEqual({ status: 'reconciled' });
        }
        const restartedPostflight = vi.fn(losingPostflight);
        const restarted = createSealedRealmsProductionPublicationReconciler({ privateState: local.secondState(), lane: 'g002', postflight: restartedPostflight });
        if (winner === 'adopted') {
          await expect(restarted.inspect({ marker: marker('7'.repeat(64)) }))
            .rejects.toThrow('SEALED_REALMS_RECONCILIATION_ADOPTED_SEALED');
        } else {
          const next = await restarted.inspect({ marker: marker('7'.repeat(64)) });
          expect('confirmation' in next).toBe(true);
        }
        expect(restartedPostflight).not.toHaveBeenCalled();
      } finally { release?.(); local.cleanup(); }
    },
  );

  it('keeps a stale durable claim as a restart fence without calling postflight', async () => {
    const local = fixture();
    try {
      const existing = marker();
      const markerDigest = codec('g002').digestSealedRealmsPublicationPossiblySubmittedMarker(existing);
      local.state.write({ root: 'runtime', relativePath: `publication/g002/markers/possibly-submitted-${markerDigest}.json`, bytes: Buffer.from(`${JSON.stringify(existing)}\n`) });
      local.state.write({ root: 'runtime', relativePath: `publication/g002/reconciliation/marker-${markerDigest}.lock`, bytes: Buffer.from(`${JSON.stringify({ schemaVersion: 1, profile: 'warpkeep-sealed-realms-publication-reconciliation-lock-v1', lane: 'g002', markerDigest })}\n`) });
      const postflight = vi.fn();
      const restarted = createSealedRealmsProductionPublicationReconciler({ privateState: local.secondState(), lane: 'g002', postflight });
      await expect(restarted.inspect({ marker: marker('f'.repeat(64)) }))
        .rejects.toThrow('SEALED_REALMS_RECONCILIATION_BUSY');
      expect(postflight).not.toHaveBeenCalled();
    } finally { local.cleanup(); }
  });

  it('durably seals the reverse adopted-claimant versus injected no-effect terminal conflict', async () => {
    const existing = marker();
    const markerDigest = codec('g002').digestSealedRealmsPublicationPossiblySubmittedMarker(existing);
    let inject = false;
    const noEffect = { schemaVersion: 1, profile: 'warpkeep-sealed-realms-publication-marker-reconciliation-v1', lane: 'g002', markerDigest, outcome: 'no-effect', databaseIdentity: null, publicationReceiptDigest: null, observationDigest: '8'.repeat(64), observedAt: '2026-08-30T00:01:00.000Z' };
    const local = fixture((phase, path) => {
      if (inject && phase === 'write-before-open' && /[\\/]reconciliation[\\/]marker-[a-f0-9]{64}\.json$/u.test(path)) {
        inject = false; writeFileSync(path, `${JSON.stringify(noEffect)}\n`, { mode: 0o600 }); chmodSync(path, 0o600);
      }
    });
    try {
      local.state.write({ root: 'runtime', relativePath: `publication/g002/markers/possibly-submitted-${markerDigest}.json`, bytes: Buffer.from(`${JSON.stringify(existing)}\n`) });
      const postflight = vi.fn(async () => ({ outcome: 'adopted' as const, databaseIdentity: '1'.repeat(64), publicationReceiptDigest: '2'.repeat(64), observationDigest: '3'.repeat(64), observedAt: '2026-08-30T00:01:01.000Z' }));
      const reconciler = createSealedRealmsProductionPublicationReconciler({ privateState: local.state, lane: 'g002', postflight });
      inject = true;
      await expect(reconciler.inspect({ marker: marker('f'.repeat(64)) }))
        .rejects.toThrow('SEALED_REALMS_RECONCILIATION_TERMINAL_CONFLICT');
      const restartedPostflight = vi.fn();
      const restarted = createSealedRealmsProductionPublicationReconciler({ privateState: local.secondState(), lane: 'g002', postflight: restartedPostflight });
      await expect(restarted.inspect({ marker: marker('7'.repeat(64)) }))
        .rejects.toThrow('SEALED_REALMS_RECONCILIATION_TERMINAL_CONFLICT');
      expect(postflight).toHaveBeenCalledTimes(1);
      expect(restartedPostflight).not.toHaveBeenCalled();
      expect(local.state.list({ root: 'runtime', relativeDirectory: 'publication/g002/markers' }))
        .toEqual([`possibly-submitted-${markerDigest}.json`]);
    } finally { local.cleanup(); }
  });
});
