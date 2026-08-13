import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { FarcasterOidcSession } from '../src/farcaster/farcasterAuthTypes';
import {
  createOwnerCanaryController,
  OWNER_CANARY_STAGES,
  ownerCanaryControllerFailureCode,
  requireOwnerCanaryPlayerEvidence,
  runOwnerCanaryPlayerEvidence,
  type OwnerCanaryEvidenceApi,
} from '../src/owner-canary/ownerCanaryController';
import type { OwnerCanaryJourneyEvidence } from '../src/owner-canary/ownerCanaryEvidence';

const FID = 12_345;
const EVIDENCE_NONCE = 'a'.repeat(64);
const ADMISSION_PLAN_DIGEST = 'b'.repeat(64);

function state(tier: number): OwnerCanaryJourneyEvidence['baseline'] {
  return Object.freeze({
    tier,
    atlasRevision: '17',
    observedAtMicros: '1786622400000000',
    workers: tier === 0 ? Object.freeze([]) : Object.freeze([
      Object.freeze({
        ordinal: 1,
        status: 'idle' as const,
        resourceKind: null,
        accruedAmount: '1',
        materializedAmount: '1',
        availableAmount: '1',
      }),
      ...[2, 3, 4].map((ordinal) => Object.freeze({
        ordinal,
        status: 'idle' as const,
        resourceKind: null,
        accruedAmount: '0',
        materializedAmount: '0',
        availableAmount: '0',
      })),
    ]),
    resources: Object.freeze({ food: '10', wood: '11', stone: '12', gold: '13' }),
  });
}

function journey(): OwnerCanaryJourneyEvidence {
  const kinds = ['food', 'wood', 'stone', 'gold'] as const;
  return Object.freeze({
    baseline: state(1),
    terminal: state(1),
    routes: Object.freeze(kinds.map((resourceKind, index) => Object.freeze({
      resourceKind,
      routeLength: index + 1,
      nodeCount: index + 2,
    }))),
    dispatches: Object.freeze(kinds.map((resourceKind, index) => Object.freeze({
      ordinal: index + 1,
      resourceKind,
      accepted: true,
    }))),
    replays: Object.freeze([true, true, true, true]),
    gathering: Object.freeze(kinds.map((resourceKind, index) => Object.freeze({
      ordinal: index + 1,
      resourceKind,
      gatheringElapsedMs: 1_000 + index,
      completedQuantumCount: 1,
    }))),
  });
}

function session(index: number): FarcasterOidcSession {
  return Object.freeze({
    jwt: `header.payload.signature${index}`,
    issuer: 'https://auth.warpkeep.com',
    audience: 'warpkeep-spacetimedb',
    expiresAt: Date.now() + 600_000,
  });
}

function commitment(fid = FID): string {
  const frames = [
    'warpkeep.production-player-canary.same-subject.v1',
    EVIDENCE_NONCE,
    `farcaster:${fid}`,
  ];
  const framed = `${frames.map((frame) => `${Buffer.byteLength(frame, 'utf8')}:${frame}`).join('|')}\n`;
  return createHash('sha256').update(framed, 'utf8').digest('hex');
}

function sequentialEvidenceApi(): OwnerCanaryEvidenceApi<Readonly<{ index: number }>> {
  return Object.freeze({
    async run({ runStage }) {
      for (const [index, stageName] of OWNER_CANARY_STAGES.entries()) {
        await runStage(stageName, async (_authority) => index);
      }
      return journey();
    },
  });
}

function fixture(overrides: Partial<Parameters<typeof createOwnerCanaryController<Readonly<{ index: number }>>>[0]> = {}) {
  let exchangeIndex = 0;
  const requestStageConsent = vi.fn(async (_input: Readonly<{
    stage: typeof OWNER_CANARY_STAGES[number];
    stageNumber: number;
    stageCount: 10;
    signal: AbortSignal;
  }>) => true);
  const getQuickAuthToken = vi.fn(async (_options: Readonly<{ force: true }>) => ({
    status: 'token' as const,
    token: `quick.header.signature${exchangeIndex}`,
  }));
  const exchangeQuickAuth = vi.fn(async () => {
    const index = exchangeIndex;
    exchangeIndex += 1;
    return Object.freeze({ session: session(index), subjectFid: FID });
  });
  const openAuthority = vi.fn(async () => Object.freeze({ index: exchangeIndex - 1 }));
  const closeAuthority = vi.fn(async () => undefined);
  const verifyPrivateSubject = vi.fn(async () => true);
  const controller = createOwnerCanaryController({
    evidenceApi: sequentialEvidenceApi(),
    requestStageConsent,
    getQuickAuthToken,
    exchangeQuickAuth,
    openAuthority,
    closeAuthority,
    verifyPrivateSubject,
    ...overrides,
  });
  return {
    controller,
    requestStageConsent,
    getQuickAuthToken,
    exchangeQuickAuth,
    openAuthority,
    closeAuthority,
    verifyPrivateSubject,
  };
}

describe('owner canary browser-memory controller', () => {
  it('requires explicit consent and fresh auth for each exact stage, then brands sanitized evidence', async () => {
    const h = fixture();
    const evidence = await runOwnerCanaryPlayerEvidence(h.controller, {
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
    });

    expect(h.requestStageConsent).toHaveBeenCalledTimes(10);
    expect(h.requestStageConsent.mock.calls.map(([input]) => input.stage)).toEqual(OWNER_CANARY_STAGES);
    expect(h.getQuickAuthToken).toHaveBeenCalledTimes(10);
    expect(h.getQuickAuthToken.mock.calls.every(([options]) => options.force === true)).toBe(true);
    expect(h.exchangeQuickAuth).toHaveBeenCalledTimes(10);
    expect(h.openAuthority).toHaveBeenCalledTimes(10);
    expect(h.closeAuthority).toHaveBeenCalledTimes(10);
    expect(h.verifyPrivateSubject).toHaveBeenCalledOnce();
    expect(h.verifyPrivateSubject).toHaveBeenCalledWith(expect.objectContaining({
      subjectFid: FID,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
    }));
    expect(evidence).toMatchObject({
      sameSubjectCommitment: commitment(),
      freshAuthenticationStageCount: 10,
      tokenPersisted: false,
      adminImpersonation: false,
      notificationBypass: false,
    });
    expect(JSON.stringify(evidence)).not.toContain(String(FID));
    expect(JSON.stringify(evidence)).not.toContain(EVIDENCE_NONCE);
    expect(JSON.stringify(evidence)).not.toContain(ADMISSION_PLAN_DIGEST);
    expect(requireOwnerCanaryPlayerEvidence(evidence)).toBe(evidence);
    expect(() => requireOwnerCanaryPlayerEvidence({ ...evidence })).toThrow();
  });

  it('fails closed before authentication when consent is denied', async () => {
    const h = fixture({ requestStageConsent: vi.fn(async () => false) });
    const error = await h.controller.run({
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryControllerFailureCode(error)).toBe('consent-denied');
    expect(h.getQuickAuthToken).not.toHaveBeenCalled();
    expect(h.exchangeQuickAuth).not.toHaveBeenCalled();
  });

  it('closes the active authority and rejects a changed fresh-auth subject', async () => {
    let exchangeIndex = 0;
    const h = fixture({
      exchangeQuickAuth: vi.fn(async () => {
        const index = exchangeIndex++;
        return Object.freeze({
          session: session(index),
          subjectFid: index === 0 ? FID : 67_890,
        });
      }),
    });
    const error = await h.controller.run({
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryControllerFailureCode(error)).toBe('subject-changed');
    expect(h.openAuthority).toHaveBeenCalledOnce();
    expect(h.closeAuthority).toHaveBeenCalledOnce();
  });

  it('rejects an unapproved private subject before opening player authority', async () => {
    const h = fixture({ verifyPrivateSubject: vi.fn(async () => false) });
    const error = await h.controller.run({
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryControllerFailureCode(error)).toBe('subject-not-approved');
    expect(h.openAuthority).not.toHaveBeenCalled();
  });

  it('requires a literal true private-subject decision', async () => {
    const h = fixture({
      verifyPrivateSubject: vi.fn(async () => 'true' as unknown as boolean),
    });
    const error = await h.controller.run({
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryControllerFailureCode(error)).toBe('subject-not-approved');
    expect(h.openAuthority).not.toHaveBeenCalled();
  });

  it.each(['stage-error', 'cancelled'] as const)(
    'makes an unconfirmed authority close dominate %s and poisons retries',
    async (mode) => {
      const closeAuthority = vi.fn(async () => {
        throw new Error('synthetic close failure');
      });
      let controller!: ReturnType<typeof createOwnerCanaryController<Readonly<{ index: number }>>>;
      const h = fixture({
        closeAuthority,
        evidenceApi: Object.freeze({
          run: async ({ runStage }) => {
            await runStage('baseline', async () => {
              if (mode === 'cancelled') controller.cancel();
              throw new Error('synthetic stage stop');
            });
            return journey();
          },
        }),
      });
      controller = h.controller;
      const first = await controller.run({
        evidenceNonce: EVIDENCE_NONCE,
        reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
      }).catch((caught: unknown) => caught);
      expect(ownerCanaryControllerFailureCode(first)).toBe('authority-close-unconfirmed');
      expect(controller.state().phase).toBe('authority-close-unconfirmed');
      expect(closeAuthority).toHaveBeenCalledOnce();

      const retry = await controller.run({
        evidenceNonce: EVIDENCE_NONCE,
        reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
      }).catch((caught: unknown) => caught);
      expect(ownerCanaryControllerFailureCode(retry)).toBe('authority-close-unconfirmed');
      expect(h.getQuickAuthToken).toHaveBeenCalledOnce();
    },
  );

  it('closes an authority even when the runtime handle is undefined', async () => {
    const closeAuthority = vi.fn(async (_authority: undefined) => undefined);
    const controller = createOwnerCanaryController<undefined>({
      evidenceApi: Object.freeze({
        run: async ({ runStage }) => {
          await runStage('baseline', async () => {
            throw new Error('synthetic stage failure');
          });
          return journey();
        },
      }),
      requestStageConsent: async () => true,
      getQuickAuthToken: async () => ({ status: 'token', token: 'quick.header.signature' }),
      exchangeQuickAuth: async () => ({ session: session(0), subjectFid: FID }),
      openAuthority: async () => undefined,
      closeAuthority,
      verifyPrivateSubject: async () => true,
    });
    const error = await controller.run({
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryControllerFailureCode(error)).toBe('stage-failed');
    expect(closeAuthority).toHaveBeenCalledOnce();
    expect(closeAuthority).toHaveBeenCalledWith(undefined);
  });

  it('rejects out-of-order stages and malformed private inputs', async () => {
    const outOfOrder = fixture({
      evidenceApi: Object.freeze({
        run: async ({ runStage }) => {
          await runStage('founder', async () => undefined);
          return journey();
        },
      }),
    });
    const orderingError = await outOfOrder.controller.run({
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryControllerFailureCode(orderingError)).toBe('evidence-contract');
    expect(outOfOrder.getQuickAuthToken).not.toHaveBeenCalled();

    const malformed = fixture();
    const inputError = await malformed.controller.run({
      evidenceNonce: 'a'.repeat(32),
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryControllerFailureCode(inputError)).toBe('invalid-private-input');

    const inherited = fixture();
    const inheritedInput = Object.create({
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
    }) as {
      evidenceNonce: string;
      reviewedAdmissionPlanDigest: string;
      unexpected: string;
    };
    inheritedInput.unexpected = 'not-an-owned-private-input';
    const inheritedError = await inherited.controller.run(inheritedInput)
      .catch((caught: unknown) => caught);
    expect(ownerCanaryControllerFailureCode(inheritedError)).toBe('invalid-private-input');
  });
});
