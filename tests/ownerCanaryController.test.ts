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
import type { OwnerCanaryPrivateSession } from '../src/owner-canary/ownerCanaryAuthClient';

const FID = 12_345;
const EVIDENCE_NONCE = 'a'.repeat(64);
const ADMISSION_PLAN_DIGEST = 'b'.repeat(64);
const ROUTE_SET_COMMITMENT = 'c'.repeat(64);

type VerificationInput = Readonly<{
  privateSession: OwnerCanaryPrivateSession;
  latchedSubjectFid: number;
  reviewedAdmissionPlanDigest: string;
  signal: AbortSignal;
}>;

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
  const openRecallRecoveryAuthority = vi.fn(async () => Object.freeze({
    index: exchangeIndex - 1,
  }));
  const closeRecallRecoveryAuthority = vi.fn(async () => undefined);
  const verifyPrivateSubject = vi.fn(async (_input: VerificationInput) => true);
  const controller = createOwnerCanaryController({
    evidenceApi: sequentialEvidenceApi(),
    requestStageConsent,
    getQuickAuthToken,
    exchangeQuickAuth,
    openAuthority,
    closeAuthority,
    openRecallRecoveryAuthority,
    closeRecallRecoveryAuthority,
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
    openRecallRecoveryAuthority,
    closeRecallRecoveryAuthority,
    verifyPrivateSubject,
  };
}

describe('owner canary browser-memory controller', () => {
  it('requires explicit consent and fresh auth for each exact stage, then brands sanitized evidence', async () => {
    let runtimeInput: Readonly<Record<string, unknown>> | undefined;
    const evidenceApi = sequentialEvidenceApi();
    const h = fixture({
      evidenceApi: Object.freeze({
        async run(input) {
          runtimeInput = input;
          return evidenceApi.run(input);
        },
      }),
    });
    const evidence = await runOwnerCanaryPlayerEvidence(h.controller, {
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
      routeSetCommitment: ROUTE_SET_COMMITMENT,
    });

    expect(h.requestStageConsent).toHaveBeenCalledTimes(10);
    expect(h.requestStageConsent.mock.calls.map(([input]) => input.stage)).toEqual(OWNER_CANARY_STAGES);
    expect(h.getQuickAuthToken).toHaveBeenCalledTimes(10);
    expect(h.getQuickAuthToken.mock.calls.every(([options]) => options.force === true)).toBe(true);
    expect(h.exchangeQuickAuth).toHaveBeenCalledTimes(10);
    expect(h.openAuthority).toHaveBeenCalledTimes(10);
    expect(h.closeAuthority).toHaveBeenCalledTimes(10);
    expect(h.verifyPrivateSubject).toHaveBeenCalledTimes(10);
    expect(h.verifyPrivateSubject.mock.calls.every(([input]) => (
      input.latchedSubjectFid === FID
      && input.privateSession.subjectFid === FID
      && input.reviewedAdmissionPlanDigest === ADMISSION_PLAN_DIGEST
    ))).toBe(true);
    expect(runtimeInput).toMatchObject({
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
      routeSetCommitment: ROUTE_SET_COMMITMENT,
    });
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
    expect(JSON.stringify(evidence)).not.toContain(ROUTE_SET_COMMITMENT);
    expect(requireOwnerCanaryPlayerEvidence(evidence)).toBe(evidence);
    expect(() => requireOwnerCanaryPlayerEvidence({ ...evidence })).toThrow();
  });

  it('fails closed before authentication when consent is denied', async () => {
    const h = fixture({ requestStageConsent: vi.fn(async () => false) });
    const error = await h.controller.run({
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
      routeSetCommitment: ROUTE_SET_COMMITMENT,
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
      routeSetCommitment: ROUTE_SET_COMMITMENT,
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
      routeSetCommitment: ROUTE_SET_COMMITMENT,
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
      routeSetCommitment: ROUTE_SET_COMMITMENT,
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
        routeSetCommitment: ROUTE_SET_COMMITMENT,
      }).catch((caught: unknown) => caught);
      expect(ownerCanaryControllerFailureCode(first)).toBe('authority-close-unconfirmed');
      expect(controller.state().phase).toBe('authority-close-unconfirmed');
      expect(closeAuthority).toHaveBeenCalledOnce();

      const retry = await controller.run({
        evidenceNonce: EVIDENCE_NONCE,
        reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
        routeSetCommitment: ROUTE_SET_COMMITMENT,
      }).catch((caught: unknown) => caught);
      expect(ownerCanaryControllerFailureCode(retry)).toBe('authority-close-unconfirmed');
      expect(h.getQuickAuthToken).toHaveBeenCalledOnce();
    },
  );

  it('uses only a fresh recovery authority after an unconfirmed main close', async () => {
    let runtimeRecoveryState: 'none' | 'required' | 'safe' = 'none';
    const evidenceAuthorities: unknown[] = [];
    const recoveryAuthorities: unknown[] = [];
    const openAuthority = vi.fn(async () => Object.freeze({
      index: 0,
      kind: 'main' as const,
    }));
    const openRecallRecoveryAuthority = vi.fn(async () => Object.freeze({
      index: 1,
      kind: 'recovery' as const,
    }));
    const h = fixture({
      openAuthority,
      closeAuthority: async () => {
        throw new Error('synthetic ambiguous main close');
      },
      openRecallRecoveryAuthority,
      closeRecallRecoveryAuthority: async () => undefined,
      recoveryApi: Object.freeze({
        state: () => runtimeRecoveryState,
        async recover(authority) {
          recoveryAuthorities.push(authority);
          runtimeRecoveryState = 'safe';
        },
      }),
      evidenceApi: Object.freeze({
        async run({ runStage }) {
          await runStage('baseline', async authority => {
            evidenceAuthorities.push(authority);
            runtimeRecoveryState = 'required';
            throw new Error('synthetic ambiguous dispatch');
          });
          return journey();
        },
      }),
    });
    const input = {
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
      routeSetCommitment: ROUTE_SET_COMMITMENT,
    };
    const mainError = await h.controller.run(input).catch((error: unknown) => error);
    expect(ownerCanaryControllerFailureCode(mainError)).toBe(
      'authority-close-unconfirmed',
    );
    expect(h.controller.recoveryState()).toBe('required');

    await expect(h.controller.recover()).resolves.toBeUndefined();
    expect(h.controller.recoveryState()).toBe('safe');
    expect(evidenceAuthorities).toEqual([{ index: 0, kind: 'main' }]);
    expect(recoveryAuthorities).toEqual([{ index: 1, kind: 'recovery' }]);
    expect(openAuthority).toHaveBeenCalledOnce();
    expect(openRecallRecoveryAuthority).toHaveBeenCalledOnce();

    const consumed = await h.controller.run(input).catch((error: unknown) => error);
    expect(ownerCanaryControllerFailureCode(consumed)).toBe(
      'authority-close-unconfirmed',
    );
    expect(openAuthority).toHaveBeenCalledOnce();
  });

  it('makes an ambiguous recovery-authority close permanently operator-only', async () => {
    let runtimeRecoveryState: 'none' | 'required' | 'safe' = 'none';
    const closeRecallRecoveryAuthority = vi.fn(async () => {
      throw new Error('synthetic ambiguous recovery close');
    });
    const h = fixture({
      closeRecallRecoveryAuthority,
      recoveryApi: Object.freeze({
        state: () => runtimeRecoveryState,
        async recover() {
          runtimeRecoveryState = 'safe';
        },
      }),
      evidenceApi: Object.freeze({
        async run({ runStage }) {
          await runStage('baseline', async () => {
            runtimeRecoveryState = 'required';
            throw new Error('synthetic ambiguous dispatch');
          });
          return journey();
        },
      }),
    });
    await expect(h.controller.run({
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
      routeSetCommitment: ROUTE_SET_COMMITMENT,
    })).rejects.toThrow();
    const beforeRecoveryAuthCount = h.getQuickAuthToken.mock.calls.length;
    const closeError = await h.controller.recover().catch((error: unknown) => error);
    expect(ownerCanaryControllerFailureCode(closeError)).toBe(
      'authority-close-unconfirmed',
    );
    expect(h.controller.state().phase).toBe(
      'recovery-authority-close-unconfirmed',
    );
    expect(h.controller.recoveryState()).toBe('unconfirmed');
    expect(closeRecallRecoveryAuthority).toHaveBeenCalledOnce();

    const blocked = await h.controller.recover().catch((error: unknown) => error);
    expect(ownerCanaryControllerFailureCode(blocked)).toBe(
      'authority-close-unconfirmed',
    );
    expect(h.getQuickAuthToken).toHaveBeenCalledTimes(beforeRecoveryAuthCount + 1);
  });

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
      openRecallRecoveryAuthority: async () => undefined,
      closeRecallRecoveryAuthority: async () => undefined,
      verifyPrivateSubject: async () => true,
    });
    const error = await controller.run({
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
      routeSetCommitment: ROUTE_SET_COMMITMENT,
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
      routeSetCommitment: ROUTE_SET_COMMITMENT,
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryControllerFailureCode(orderingError)).toBe('evidence-contract');
    expect(outOfOrder.getQuickAuthToken).not.toHaveBeenCalled();

    const malformed = fixture();
    const inputError = await malformed.controller.run({
      evidenceNonce: 'a'.repeat(32),
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
      routeSetCommitment: ROUTE_SET_COMMITMENT,
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryControllerFailureCode(inputError)).toBe('invalid-private-input');

    const malformedRoute = fixture();
    const routeError = await malformedRoute.controller.run({
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
      routeSetCommitment: 'c'.repeat(63),
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryControllerFailureCode(routeError)).toBe('invalid-private-input');
    expect(malformedRoute.getQuickAuthToken).not.toHaveBeenCalled();

    let routeGetterRead = false;
    const accessorInput = {
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
      get routeSetCommitment() {
        routeGetterRead = true;
        return ROUTE_SET_COMMITMENT;
      },
    };
    const accessor = fixture();
    const accessorError = await accessor.controller.run(accessorInput)
      .catch((caught: unknown) => caught);
    expect(ownerCanaryControllerFailureCode(accessorError)).toBe('invalid-private-input');
    expect(routeGetterRead).toBe(false);
    expect(accessor.getQuickAuthToken).not.toHaveBeenCalled();

    const inherited = fixture();
    const inheritedInput = Object.create({
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
      routeSetCommitment: ROUTE_SET_COMMITMENT,
    }) as {
      evidenceNonce: string;
      reviewedAdmissionPlanDigest: string;
      routeSetCommitment: string;
      unexpected: string;
    };
    inheritedInput.unexpected = 'not-an-owned-private-input';
    const inheritedError = await inherited.controller.run(inheritedInput)
      .catch((caught: unknown) => caught);
    expect(ownerCanaryControllerFailureCode(inheritedError)).toBe('invalid-private-input');
  });

  it('permanently consumes the main run and fresh-authenticates every recovery click', async () => {
    let runtimeRecoveryState: 'none' | 'required' | 'unconfirmed' | 'safe' = 'none';
    const recover = vi.fn(async () => {
      runtimeRecoveryState = 'safe';
    });
    let exchangeIndex = 0;
    const exchangeQuickAuth = vi.fn(async () => {
      const index = exchangeIndex++;
      return Object.freeze({
        session: session(index),
        subjectFid: index === 1 ? FID + 1 : FID,
      });
    });
    const h = fixture({
      exchangeQuickAuth,
      recoveryApi: Object.freeze({
        state: () => runtimeRecoveryState,
        recover,
      }),
      evidenceApi: Object.freeze({
        async run({ runStage }) {
          await runStage('baseline', async () => {
            runtimeRecoveryState = 'required';
            throw new Error('synthetic post-dispatch ambiguity');
          });
          return journey();
        },
      }),
    });
    const input = {
      evidenceNonce: EVIDENCE_NONCE,
      reviewedAdmissionPlanDigest: ADMISSION_PLAN_DIGEST,
      routeSetCommitment: ROUTE_SET_COMMITMENT,
    };
    await expect(h.controller.run(input)).rejects.toThrow();
    expect(h.controller.recoveryState()).toBe('required');
    expect(h.getQuickAuthToken).toHaveBeenCalledTimes(1);

    const consumed = await h.controller.run(input).catch((caught: unknown) => caught);
    expect(ownerCanaryControllerFailureCode(consumed)).toBe('stage-failed');
    expect(h.getQuickAuthToken).toHaveBeenCalledTimes(1);

    const changed = await h.controller.recover().catch((caught: unknown) => caught);
    expect(ownerCanaryControllerFailureCode(changed)).toBe('subject-changed');
    expect(h.controller.recoveryState()).toBe('unconfirmed');
    expect(recover).not.toHaveBeenCalled();

    await expect(h.controller.recover()).resolves.toBeUndefined();
    expect(h.controller.recoveryState()).toBe('safe');
    expect(recover).toHaveBeenCalledOnce();
    expect(h.getQuickAuthToken).toHaveBeenCalledTimes(3);
    expect(exchangeQuickAuth).toHaveBeenCalledTimes(3);
    expect(h.verifyPrivateSubject).toHaveBeenCalledTimes(2);
    expect(h.verifyPrivateSubject.mock.calls.every(([verification]) => (
      verification.latchedSubjectFid === FID
      && verification.reviewedAdmissionPlanDigest === ADMISSION_PLAN_DIGEST
    ))).toBe(true);
  });
});
