import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOwnerCanaryController, OWNER_CANARY_STAGES } from '../src/owner-canary/ownerCanaryController';
import {
  acknowledgeOwnerCanarySanitizedEvidenceInProcess,
  OWNER_CANARY_PRODUCTION_POLL_INTERVAL_MILLISECONDS,
  OWNER_CANARY_PRODUCTION_POLL_MAXIMUM_ATTEMPTS,
  OWNER_CANARY_PRODUCTION_POLL_POLICY,
  waitForOwnerCanaryProductionPoll,
} from '../src/owner-canary/ownerCanaryProductionComposition';

const DIGEST = 'a'.repeat(64);

afterEach(() => {
  vi.useRealTimers();
});

describe('owner canary reviewed production composition', () => {
  it('pins the complete route/gathering/return window to 96 exact five-second samples', () => {
    const maximumRouteMilliseconds = 12 * 30_000;
    const maximumGatheringStartMilliseconds = maximumRouteMilliseconds + 60_000;
    const sampledMilliseconds = (OWNER_CANARY_PRODUCTION_POLL_MAXIMUM_ATTEMPTS - 1)
      * OWNER_CANARY_PRODUCTION_POLL_INTERVAL_MILLISECONDS;
    const maximumTerminalReturnMilliseconds = maximumRouteMilliseconds + 30_000;
    expect(OWNER_CANARY_PRODUCTION_POLL_INTERVAL_MILLISECONDS).toBe(5_000);
    expect(OWNER_CANARY_PRODUCTION_POLL_MAXIMUM_ATTEMPTS).toBe(96);
    expect(maximumGatheringStartMilliseconds).toBe(420_000);
    expect(sampledMilliseconds).toBe(475_000);
    expect(sampledMilliseconds - maximumGatheringStartMilliseconds).toBe(55_000);
    expect(sampledMilliseconds).toBeGreaterThan(maximumTerminalReturnMilliseconds);
    expect(OWNER_CANARY_PRODUCTION_POLL_POLICY).toEqual({
      intervalMilliseconds: 5_000,
      maximumAttempts: 96,
      wait: waitForOwnerCanaryProductionPoll,
    });
    expect(Object.isFrozen(OWNER_CANARY_PRODUCTION_POLL_POLICY)).toBe(true);
  });

  it('rejects caller-selected cadence and clears exact waits on abort', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    await expect(waitForOwnerCanaryProductionPoll(4_999, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    const pending = waitForOwnerCanaryProductionPoll(5_000, controller.signal);
    await vi.advanceTimersByTimeAsync(4_999);
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeUndefined();

    const aborted = new AbortController();
    const stopped = waitForOwnerCanaryProductionPoll(5_000, aborted.signal);
    aborted.abort();
    await expect(stopped).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('acknowledges only controller-branded evidence in process and performs no I/O', async () => {
    const kinds = ['food', 'wood', 'stone', 'gold'] as const;
    const state = {
      tier: 0,
      atlasRevision: '1',
      observedAtMicros: '1',
      workers: [],
      resources: { food: '0', wood: '0', stone: '0', gold: '0' },
    };
    const journey = {
      baseline: state,
      terminal: { ...state, observedAtMicros: '2' },
      routes: kinds.map(resourceKind => ({ resourceKind, routeLength: 1, nodeCount: 1 })),
      dispatches: kinds.map((resourceKind, index) => ({
        ordinal: index + 1,
        resourceKind,
        accepted: true,
      })),
      replays: [true, true, true, true],
      gathering: kinds.map((resourceKind, index) => ({
        ordinal: index + 1,
        resourceKind,
        gatheringElapsedMs: 60_000,
        completedQuantumCount: 1,
      })),
    };
    const controller = createOwnerCanaryController({
      evidenceApi: Object.freeze({
        async run({ runStage }) {
          for (const stage of OWNER_CANARY_STAGES) {
            await runStage(stage, async () => undefined);
          }
          return journey;
        },
      }),
      requestStageConsent: async () => true,
      getQuickAuthToken: async () => ({ status: 'token', token: 'quick.header.signature' }),
      exchangeQuickAuth: async () => ({
        session: {
          jwt: 'header.payload.signature',
          issuer: 'https://auth.warpkeep.com',
          audience: 'warpkeep-spacetimedb',
          expiresAt: 10_000,
        },
        subjectFid: 1,
      }),
      openAuthority: async () => Object.freeze({}),
      closeAuthority: async () => undefined,
      openRecallRecoveryAuthority: async () => Object.freeze({}),
      closeRecallRecoveryAuthority: async () => undefined,
      verifyPrivateSubject: async () => true,
    });
    const evidence = await controller.run({
      evidenceNonce: DIGEST,
      reviewedAdmissionPlanDigest: 'b'.repeat(64),
      routeSetCommitment: 'c'.repeat(64),
    });
    expect(acknowledgeOwnerCanarySanitizedEvidenceInProcess(evidence)).toBeUndefined();
    expect(() => acknowledgeOwnerCanarySanitizedEvidenceInProcess({
      ...evidence,
    })).toThrow();

    const source = readFileSync(resolve(
      process.cwd(),
      'src/owner-canary/ownerCanaryProductionComposition.ts',
    ), 'utf8');
    expect(source).not.toMatch(/fetch\s*\(|localStorage|sessionStorage|indexedDB|WebSocket|navigator\./u);
    expect(source).not.toContain('??');
  });
});
