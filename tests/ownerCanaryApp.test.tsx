import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getQuickAuthToken } = vi.hoisted(() => ({
  getQuickAuthToken: vi.fn(async (): Promise<
    Readonly<{ status: 'unsupported' }> | Readonly<{ status: 'token'; token: string }>
  > => Object.freeze({ status: 'unsupported' as const })),
}));

vi.mock('../src/farcaster/miniapp/MiniAppHostProvider', () => ({
  MiniAppHostProvider: ({ children }: { children: ReactNode }) => children,
  useMiniAppHost: () => Object.freeze({
    state: 'miniapp',
    quickAuth: Object.freeze({
      getToken: getQuickAuthToken,
    }),
  }),
}));

import { OwnerCanaryApp } from '../src/owner-canary/OwnerCanaryApp';
import {
  OWNER_CANARY_STAGES,
} from '../src/owner-canary/ownerCanaryController';
import type {
  OwnerCanaryEvidenceApi,
} from '../src/owner-canary/ownerCanaryController';
import type { OwnerCanaryJourneyEvidence } from '../src/owner-canary/ownerCanaryEvidence';
import type { OwnerCanaryRuntime } from '../src/owner-canary/ownerCanaryRuntime';

const NO_RECOVERY = Object.freeze({
  state: () => 'none' as const,
  recover: async () => undefined,
});

const NO_FRESH_PAGE_RECOVERY = Object.freeze({
  recover: async () => undefined,
});

const PRIVATE_NONCE = 'a'.repeat(64);
const PLAN_DIGEST = 'b'.repeat(64);
const ROUTE_SET_COMMITMENT = 'c'.repeat(64);
const FID = 12_345;

function segment(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function playerJwt(now: number): Readonly<{ jwt: string; expiresAt: number }> {
  const issuedAtSeconds = Math.floor(now / 1_000);
  const expiresAt = (issuedAtSeconds + 10 * 60) * 1_000;
  const jwt = `${segment({ alg: 'ES256', typ: 'JWT', kid: 'owner-canary-app-test' })}.${segment({
    iss: 'https://auth.warpkeep.com',
    sub: `farcaster:${FID}`,
    aud: ['warpkeep-spacetimedb'],
    token_type: 'spacetime-access',
    fid: String(FID),
    auth_version: 2,
    auth_epoch: 7,
    roles: [],
    iat: issuedAtSeconds,
    nbf: issuedAtSeconds,
    exp: expiresAt / 1_000,
    session_iat: issuedAtSeconds,
    session_exp: expiresAt / 1_000,
    jti: 'owner-canary-app-test-token',
  })}.test_signature`;
  return Object.freeze({ jwt, expiresAt });
}

function journey(): OwnerCanaryJourneyEvidence {
  const kinds = ['food', 'wood', 'stone', 'gold'] as const;
  return Object.freeze({
    baseline: Object.freeze({
      tier: 1,
      atlasRevision: '17',
      observedAtMicros: '1786622400000000',
      workers: Object.freeze(kinds.map((_kind, index) => Object.freeze({
        ordinal: index + 1,
        status: 'idle' as const,
        resourceKind: null,
        accruedAmount: '0',
        materializedAmount: '0',
        availableAmount: '0',
      }))),
      resources: Object.freeze({ food: '0', wood: '0', stone: '0', gold: '0' }),
    }),
    terminal: Object.freeze({
      tier: 1,
      atlasRevision: '17',
      observedAtMicros: '1786622460000000',
      workers: Object.freeze(kinds.map((_kind, index) => Object.freeze({
        ordinal: index + 1,
        status: 'idle' as const,
        resourceKind: null,
        accruedAmount: '1',
        materializedAmount: '1',
        availableAmount: '1',
      }))),
      resources: Object.freeze({ food: '1', wood: '1', stone: '1', gold: '1' }),
    }),
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
      gatheringElapsedMs: 60_000 + index,
      completedQuantumCount: 1,
    }))),
  });
}

function failingRuntime(): OwnerCanaryRuntime {
  return Object.freeze({
    recoveryApi: NO_RECOVERY,
    freshPageRecoveryApi: NO_FRESH_PAGE_RECOVERY,
    evidenceApi: Object.freeze({
      run: async () => {
        throw new Error('synthetic pre-authority failure');
      },
    }),
    openAuthority: async () => Object.freeze({}),
    closeAuthority: async () => undefined,
    openRecallRecoveryAuthority: async () => Object.freeze({}),
    closeRecallRecoveryAuthority: async () => undefined,
    openFreshPageRecoveryAuthority: async () => Object.freeze({}),
    closeFreshPageRecoveryAuthority: async () => undefined,
    verifyPrivateSubject: async () => true,
    acceptSanitizedEvidence: async () => undefined,
  });
}

function handoffFailingRuntime(
  onHandoff: () => void,
): OwnerCanaryRuntime<Readonly<Record<string, never>>> {
  const evidenceApi: OwnerCanaryEvidenceApi<Readonly<Record<string, never>>> = Object.freeze({
    async run({ runStage }) {
      for (const stage of OWNER_CANARY_STAGES) {
        await runStage(stage, async () => undefined);
      }
      return journey();
    },
  });
  return Object.freeze({
    recoveryApi: NO_RECOVERY,
    freshPageRecoveryApi: NO_FRESH_PAGE_RECOVERY,
    evidenceApi,
    openAuthority: async () => Object.freeze({}),
    closeAuthority: async () => undefined,
    openRecallRecoveryAuthority: async () => Object.freeze({}),
    closeRecallRecoveryAuthority: async () => undefined,
    openFreshPageRecoveryAuthority: async () => Object.freeze({}),
    closeFreshPageRecoveryAuthority: async () => undefined,
    verifyPrivateSubject: async () => true,
    acceptSanitizedEvidence: async () => {
      onHandoff();
      throw new Error('synthetic ambiguous handoff');
    },
  });
}

function stageFailingRuntime(onMutation: () => void): OwnerCanaryRuntime<Readonly<Record<string, never>>> {
  const evidenceApi: OwnerCanaryEvidenceApi<Readonly<Record<string, never>>> = Object.freeze({
    async run({ runStage }) {
      await runStage('baseline', async () => {
        onMutation();
        throw new Error('synthetic post-mutation response failure');
      });
      return journey();
    },
  });
  return Object.freeze({
    recoveryApi: NO_RECOVERY,
    freshPageRecoveryApi: NO_FRESH_PAGE_RECOVERY,
    evidenceApi,
    openAuthority: async () => Object.freeze({}),
    closeAuthority: async () => undefined,
    openRecallRecoveryAuthority: async () => Object.freeze({}),
    closeRecallRecoveryAuthority: async () => undefined,
    openFreshPageRecoveryAuthority: async () => Object.freeze({}),
    closeFreshPageRecoveryAuthority: async () => undefined,
    verifyPrivateSubject: async () => true,
    acceptSanitizedEvidence: async () => undefined,
  });
}

function recoverableRuntime(
  onRecovery: () => void,
  closeRecallRecoveryAuthority: () => Promise<void> = async () => undefined,
  closeAuthority: () => Promise<void> = async () => undefined,
): OwnerCanaryRuntime<Readonly<Record<string, never>>> {
  let recoveryState: 'none' | 'required' | 'running' | 'safe' | 'unconfirmed' = 'none';
  const recoveryApi = Object.freeze({
    state: () => recoveryState,
    async recover() {
      recoveryState = 'running';
      onRecovery();
      recoveryState = 'safe';
    },
  });
  const evidenceApi: OwnerCanaryEvidenceApi<Readonly<Record<string, never>>> = Object.freeze({
    async run({ runStage }) {
      for (const stage of OWNER_CANARY_STAGES.slice(0, 3)) {
        await runStage(stage, async () => undefined);
      }
      await runStage('dispatch', async () => {
        recoveryState = 'required';
        throw new Error('synthetic lost dispatch response');
      });
      return journey();
    },
  });
  return Object.freeze({
    recoveryApi,
    freshPageRecoveryApi: NO_FRESH_PAGE_RECOVERY,
    evidenceApi,
    openAuthority: async () => Object.freeze({}),
    closeAuthority,
    openRecallRecoveryAuthority: async () => Object.freeze({}),
    closeRecallRecoveryAuthority,
    openFreshPageRecoveryAuthority: async () => Object.freeze({}),
    closeFreshPageRecoveryAuthority: async () => undefined,
    verifyPrivateSubject: async () => true,
    acceptSanitizedEvidence: async () => undefined,
  });
}

function freshPageRecoverableRuntime(
  onRecovery: (input: Readonly<{
    evidenceNonce: string;
    reviewedAdmissionPlanDigest: string;
  }>) => void,
  closeFreshPageRecoveryAuthority: () => Promise<void> = async () => undefined,
): OwnerCanaryRuntime<Readonly<Record<string, never>>> {
  return Object.freeze({
    recoveryApi: NO_RECOVERY,
    freshPageRecoveryApi: Object.freeze({
      async recover(
        _authority: Readonly<Record<string, never>>,
        input: Readonly<{
          evidenceNonce: string;
          reviewedAdmissionPlanDigest: string;
        }>,
      ) {
        onRecovery(input);
      },
    }),
    evidenceApi: Object.freeze({
      run: async () => {
        throw new Error('main evidence must stay excluded in reload recovery');
      },
    }),
    openAuthority: async () => Object.freeze({}),
    closeAuthority: async () => undefined,
    openRecallRecoveryAuthority: async () => Object.freeze({}),
    closeRecallRecoveryAuthority: async () => undefined,
    openFreshPageRecoveryAuthority: async () => Object.freeze({}),
    closeFreshPageRecoveryAuthority,
    verifyPrivateSubject: async () => true,
    acceptSanitizedEvidence: async () => undefined,
  });
}

function cancellableRuntime(onMutation: () => void): OwnerCanaryRuntime<Readonly<Record<string, never>>> {
  const evidenceApi: OwnerCanaryEvidenceApi<Readonly<Record<string, never>>> = Object.freeze({
    async run({ runStage }) {
      await runStage('baseline', async () => {
        onMutation();
      });
      await runStage('founder', async () => undefined);
      return journey();
    },
  });
  return Object.freeze({
    recoveryApi: NO_RECOVERY,
    freshPageRecoveryApi: NO_FRESH_PAGE_RECOVERY,
    evidenceApi,
    openAuthority: async () => Object.freeze({}),
    closeAuthority: async () => undefined,
    openRecallRecoveryAuthority: async () => Object.freeze({}),
    closeRecallRecoveryAuthority: async () => undefined,
    openFreshPageRecoveryAuthority: async () => Object.freeze({}),
    closeFreshPageRecoveryAuthority: async () => undefined,
    verifyPrivateSubject: async () => true,
    acceptSanitizedEvidence: async () => undefined,
  });
}

function prepareAuthorizedAuth() {
  const now = Date.now();
  const player = playerJwt(now);
  getQuickAuthToken.mockResolvedValue(Object.freeze({
    status: 'token' as const,
    token: 'quick.header.signature',
  }));
  const fetch = vi.fn(async () => new Response(JSON.stringify({
    version: 1,
    status: 'authorized',
    accessToken: player.jwt,
    tokenType: 'spacetime-access',
    accessExpiresAt: player.expiresAt,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  getQuickAuthToken.mockReset();
  getQuickAuthToken.mockResolvedValue(Object.freeze({ status: 'unsupported' as const }));
  vi.unstubAllGlobals();
});

describe('owner canary run-level consent', () => {
  it('keeps the production entry inert until the reviewed transport is composed', async () => {
    render(<OwnerCanaryApp />);
    expect(await screen.findByText('The reviewed canary transport is not prepared.'))
      .toBeTruthy();
    expect(screen.queryByLabelText('Private evidence nonce')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Begin reviewed canary' })).toBeNull();
    expect(getQuickAuthToken).not.toHaveBeenCalled();
  });

  it('requires the exact third private commitment and states single-use urgent-recall semantics', async () => {
    render(<OwnerCanaryApp loadRuntime={async () => failingRuntime()} />);
    const nonce = await screen.findByLabelText('Private evidence nonce');
    const plan = screen.getByLabelText('Reviewed admission-plan digest');
    const routes = screen.getByLabelText('Private route-set commitment');
    const confirmation = screen.getByRole('checkbox', {
      name: 'I approve this run to mutate an already-admitted live production player.',
    });
    const begin = screen.getByRole('button', { name: 'Begin reviewed canary' });
    expect(screen.getByText(/page realm is single-use/i).textContent).toContain('Never retry');
    expect(screen.getByText(/page realm is single-use/i).textContent).toContain('recalled urgently');

    fireEvent.change(nonce, { target: { value: PRIVATE_NONCE } });
    fireEvent.change(plan, { target: { value: PLAN_DIGEST } });
    fireEvent.change(routes, { target: { value: ROUTE_SET_COMMITMENT.slice(1) } });
    fireEvent.click(confirmation);
    expect((begin as HTMLButtonElement).disabled).toBe(true);
    expect(getQuickAuthToken).not.toHaveBeenCalled();
  });

  it('runs fresh-page ordinal-zero recovery from immediately cleared uncontrolled inputs only', async () => {
    const fetch = prepareAuthorizedAuth();
    const recoveries: Array<Readonly<{
      evidenceNonce: string;
      reviewedAdmissionPlanDigest: string;
    }>> = [];
    render(<OwnerCanaryApp loadRuntime={async () => freshPageRecoverableRuntime(
      input => recoveries.push(input),
    )} />);

    const mainNonce = await screen.findByLabelText('Private evidence nonce');
    const mainPlan = screen.getByLabelText('Reviewed admission-plan digest');
    const mainRoutes = screen.getByLabelText('Private route-set commitment');
    const confirmation = screen.getByRole('checkbox', {
      name: 'I approve this run to mutate an already-admitted live production player.',
    });
    const begin = screen.getByRole('button', { name: 'Begin reviewed canary' });
    fireEvent.change(mainNonce, { target: { value: PRIVATE_NONCE } });
    fireEvent.change(mainPlan, { target: { value: PLAN_DIGEST } });
    fireEvent.change(mainRoutes, { target: { value: ROUTE_SET_COMMITMENT } });
    fireEvent.click(confirmation);
    expect((begin as HTMLButtonElement).disabled).toBe(false);

    const recoveryNonce = screen.getByLabelText('Reload recovery evidence nonce');
    const recoveryPlan = screen.getByLabelText('Reload recovery admission-plan digest');
    expect(recoveryNonce.getAttribute('value')).toBe('');
    expect(recoveryPlan.getAttribute('value')).toBe('');
    fireEvent.change(recoveryNonce, { target: { value: PRIVATE_NONCE } });
    fireEvent.change(recoveryPlan, { target: { value: PLAN_DIGEST } });
    const recover = screen.getByRole('button', {
      name: 'Authenticate and attempt reload recall-or-fence',
    });
    fireEvent.click(recover);

    expect((recoveryNonce as HTMLInputElement).value).toBe('');
    expect((recoveryPlan as HTMLInputElement).value).toBe('');
    expect((mainNonce as HTMLInputElement).value).toBe('');
    expect((mainPlan as HTMLInputElement).value).toBe('');
    expect((mainRoutes as HTMLInputElement).value).toBe('');
    expect((confirmation as HTMLInputElement).checked).toBe(false);
    expect((begin as HTMLButtonElement).disabled).toBe(true);

    await waitFor(() => expect(recoveries).toHaveLength(1));
    expect(recoveries[0]).toEqual({
      evidenceNonce: PRIVATE_NONCE,
      reviewedAdmissionPlanDigest: PLAN_DIGEST,
    });
    expect(Object.isFrozen(recoveries[0])).toBe(true);
    expect(Reflect.ownKeys(recoveries[0] as object)).toEqual([
      'evidenceNonce',
      'reviewedAdmissionPlanDigest',
    ]);
    expect(getQuickAuthToken).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'ended browser-unconfirmed',
    );
    expect(screen.queryByText(/Recall safety was observed/u)).toBeNull();

    fireEvent.change(recoveryNonce, { target: { value: PRIVATE_NONCE } });
    fireEvent.change(recoveryPlan, { target: { value: PLAN_DIGEST } });
    fireEvent.click(recover);
    await waitFor(() => expect(recoveries).toHaveLength(2));
    expect(getQuickAuthToken).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((begin as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/reports recovery as safe/u)).toBeTruthy();
  });

  it('consumes the main page before validating malformed reload recovery input', async () => {
    const recovery = vi.fn();
    render(<OwnerCanaryApp loadRuntime={async () => freshPageRecoverableRuntime(recovery)} />);
    const nonce = await screen.findByLabelText('Reload recovery evidence nonce');
    const plan = screen.getByLabelText('Reload recovery admission-plan digest');
    fireEvent.change(nonce, { target: { value: PRIVATE_NONCE.slice(1) } });
    fireEvent.change(plan, { target: { value: PLAN_DIGEST } });
    fireEvent.click(screen.getByRole('button', {
      name: 'Authenticate and attempt reload recall-or-fence',
    }));
    expect((nonce as HTMLInputElement).value).toBe('');
    expect((plan as HTMLInputElement).value).toBe('');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'ended browser-unconfirmed',
    );
    expect(recovery).not.toHaveBeenCalled();
    expect(getQuickAuthToken).not.toHaveBeenCalled();
    expect((screen.getByRole('button', {
      name: 'Begin reviewed canary',
    }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('permanently consumes the page session after a failed run attempt', async () => {
    render(<OwnerCanaryApp loadRuntime={async () => failingRuntime()} />);

    const nonce = await screen.findByLabelText('Private evidence nonce');
    const plan = screen.getByLabelText('Reviewed admission-plan digest');
    const routes = screen.getByLabelText('Private route-set commitment');
    const confirmation = screen.getByRole('checkbox', {
      name: 'I approve this run to mutate an already-admitted live production player.',
    });
    const begin = screen.getByRole('button', { name: 'Begin reviewed canary' });

    fireEvent.change(nonce, { target: { value: PRIVATE_NONCE } });
    fireEvent.change(plan, { target: { value: PLAN_DIGEST } });
    fireEvent.change(routes, { target: { value: ROUTE_SET_COMMITMENT } });
    fireEvent.click(confirmation);
    expect((begin as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(begin);
    expect((nonce as HTMLInputElement).value).toBe('');
    expect((plan as HTMLInputElement).value).toBe('');
    expect((routes as HTMLInputElement).value).toBe('');

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(
      'production outcome may be ambiguous',
    ));
    expect((confirmation as HTMLInputElement).checked).toBe(false);
    fireEvent.change(nonce, { target: { value: PRIVATE_NONCE } });
    fireEvent.change(plan, { target: { value: PLAN_DIGEST } });
    fireEvent.change(routes, { target: { value: ROUTE_SET_COMMITMENT } });
    expect((begin as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(confirmation);
    expect((begin as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not retry after a stage mutates and its response fails', async () => {
    const fetch = prepareAuthorizedAuth();
    const mutationAccepted = vi.fn();
    render(<OwnerCanaryApp loadRuntime={async () => stageFailingRuntime(mutationAccepted)} />);

    const nonce = await screen.findByLabelText('Private evidence nonce');
    const plan = screen.getByLabelText('Reviewed admission-plan digest');
    const routes = screen.getByLabelText('Private route-set commitment');
    const confirmation = screen.getByRole('checkbox', {
      name: 'I approve this run to mutate an already-admitted live production player.',
    });
    const begin = screen.getByRole('button', { name: 'Begin reviewed canary' });
    fireEvent.change(nonce, { target: { value: PRIVATE_NONCE } });
    fireEvent.change(plan, { target: { value: PLAN_DIGEST } });
    fireEvent.change(routes, { target: { value: ROUTE_SET_COMMITMENT } });
    fireEvent.click(confirmation);
    fireEvent.click(begin);

    await screen.findByText('STAGE 1 OF 10');
    fireEvent.click(screen.getByRole('button', { name: 'Authenticate and run this stage' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(
      'production outcome may be ambiguous',
    ));
    expect(mutationAccepted).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();

    fireEvent.change(nonce, { target: { value: PRIVATE_NONCE } });
    fireEvent.change(plan, { target: { value: PLAN_DIGEST } });
    fireEvent.change(routes, { target: { value: ROUTE_SET_COMMITMENT } });
    fireEvent.click(confirmation);
    expect((begin as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers only fresh-auth recall recovery after dispatch ambiguity and never re-enables main run', async () => {
    const fetch = prepareAuthorizedAuth();
    const recovery = vi.fn();
    render(<OwnerCanaryApp loadRuntime={async () => recoverableRuntime(recovery)} />);

    const nonce = await screen.findByLabelText('Private evidence nonce');
    const plan = screen.getByLabelText('Reviewed admission-plan digest');
    const routes = screen.getByLabelText('Private route-set commitment');
    const confirmation = screen.getByRole('checkbox', {
      name: 'I approve this run to mutate an already-admitted live production player.',
    });
    const begin = screen.getByRole('button', { name: 'Begin reviewed canary' });
    fireEvent.change(nonce, { target: { value: PRIVATE_NONCE } });
    fireEvent.change(plan, { target: { value: PLAN_DIGEST } });
    fireEvent.change(routes, { target: { value: ROUTE_SET_COMMITMENT } });
    fireEvent.click(confirmation);
    fireEvent.click(begin);

    for (let stageNumber = 1; stageNumber <= 4; stageNumber += 1) {
      await screen.findByText(`STAGE ${stageNumber} OF 10`);
      fireEvent.click(screen.getByRole('button', {
        name: 'Authenticate and run this stage',
      }));
    }
    const recoveryButton = await screen.findByRole('button', {
      name: 'Authenticate and attempt recall-only recovery',
    });
    expect(screen.getByRole('alert').textContent).toContain(
      'recall-only control below is the sole permitted browser action',
    );
    expect(screen.getByText(/This cannot dispatch, restart, complete evidence, or authorize release/u))
      .toBeTruthy();
    expect((begin as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(recoveryButton);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(
      'Recall safety was observed',
    ));
    expect(recovery).toHaveBeenCalledOnce();
    expect(getQuickAuthToken).toHaveBeenCalledTimes(5);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(screen.queryByRole('button', {
      name: 'Authenticate and attempt recall-only recovery',
    })).toBeNull();
    expect((begin as HTMLButtonElement).disabled).toBe(true);
  });

  it('labels an ambiguous-main recovery as the evidence-invalidating all-four fence', async () => {
    prepareAuthorizedAuth();
    let closeCount = 0;
    render(<OwnerCanaryApp loadRuntime={async () => recoverableRuntime(
      vi.fn(),
      async () => undefined,
      async () => {
        closeCount += 1;
        if (closeCount === 4) throw new Error('synthetic ambiguous main close');
      },
    )} />);

    fireEvent.change(await screen.findByLabelText('Private evidence nonce'), {
      target: { value: PRIVATE_NONCE },
    });
    fireEvent.change(screen.getByLabelText('Reviewed admission-plan digest'), {
      target: { value: PLAN_DIGEST },
    });
    fireEvent.change(screen.getByLabelText('Private route-set commitment'), {
      target: { value: ROUTE_SET_COMMITMENT },
    });
    fireEvent.click(screen.getByRole('checkbox', {
      name: 'I approve this run to mutate an already-admitted live production player.',
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Begin reviewed canary' }));
    for (let stageNumber = 1; stageNumber <= 4; stageNumber += 1) {
      await screen.findByText(`STAGE ${stageNumber} OF 10`);
      fireEvent.click(screen.getByRole('button', {
        name: 'Authenticate and run this stage',
      }));
    }

    expect(await screen.findByRole('heading', {
      name: 'Urgent all-four recall-or-fence',
    })).toBeTruthy();
    expect(screen.getByText(/fence every reviewed dispatch key/u)).toBeTruthy();
    expect(screen.getByText(/permanently invalidates evidence/u)).toBeTruthy();
    expect(screen.getByRole('button', {
      name: 'Authenticate and attempt all-four recall-or-fence',
    })).toBeTruthy();
    expect(screen.queryByText(/recall only workers whose reviewed dispatch/u)).toBeNull();
  });

  it('removes browser recovery after recovery-authority close becomes ambiguous', async () => {
    prepareAuthorizedAuth();
    const recovery = vi.fn();
    render(<OwnerCanaryApp loadRuntime={async () => recoverableRuntime(
      recovery,
      async () => {
        throw new Error('synthetic ambiguous recovery close');
      },
    )} />);

    fireEvent.change(await screen.findByLabelText('Private evidence nonce'), {
      target: { value: PRIVATE_NONCE },
    });
    fireEvent.change(screen.getByLabelText('Reviewed admission-plan digest'), {
      target: { value: PLAN_DIGEST },
    });
    fireEvent.change(screen.getByLabelText('Private route-set commitment'), {
      target: { value: ROUTE_SET_COMMITMENT },
    });
    fireEvent.click(screen.getByRole('checkbox', {
      name: 'I approve this run to mutate an already-admitted live production player.',
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Begin reviewed canary' }));
    for (let stageNumber = 1; stageNumber <= 4; stageNumber += 1) {
      await screen.findByText(`STAGE ${stageNumber} OF 10`);
      fireEvent.click(screen.getByRole('button', {
        name: 'Authenticate and run this stage',
      }));
    }
    fireEvent.click(await screen.findByRole('button', {
      name: 'Authenticate and attempt recall-only recovery',
    }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(
      'Recovery-authority closure could not be confirmed',
    ));
    expect(recovery).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', {
      name: 'Authenticate and attempt recall-only recovery',
    })).toBeNull();
    expect(screen.queryByText(/Recall safety was observed/u)).toBeNull();
  });

  it('does not retry after cancellation follows an accepted stage mutation', async () => {
    prepareAuthorizedAuth();
    const mutationAccepted = vi.fn();
    render(<OwnerCanaryApp loadRuntime={async () => cancellableRuntime(mutationAccepted)} />);

    const nonce = await screen.findByLabelText('Private evidence nonce');
    const plan = screen.getByLabelText('Reviewed admission-plan digest');
    const routes = screen.getByLabelText('Private route-set commitment');
    const confirmation = screen.getByRole('checkbox', {
      name: 'I approve this run to mutate an already-admitted live production player.',
    });
    const begin = screen.getByRole('button', { name: 'Begin reviewed canary' });
    fireEvent.change(nonce, { target: { value: PRIVATE_NONCE } });
    fireEvent.change(plan, { target: { value: PLAN_DIGEST } });
    fireEvent.change(routes, { target: { value: ROUTE_SET_COMMITMENT } });
    fireEvent.click(confirmation);
    fireEvent.click(begin);

    await screen.findByText('STAGE 1 OF 10');
    fireEvent.click(screen.getByRole('button', { name: 'Authenticate and run this stage' }));
    await screen.findByText('STAGE 2 OF 10');
    expect(mutationAccepted).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(
      'accepted production mutation cannot be ruled out',
    ));
    fireEvent.change(nonce, { target: { value: PRIVATE_NONCE } });
    fireEvent.change(plan, { target: { value: PLAN_DIGEST } });
    fireEvent.change(routes, { target: { value: ROUTE_SET_COMMITMENT } });
    fireEvent.click(confirmation);
    expect((begin as HTMLButtonElement).disabled).toBe(true);
  });

  it('poisons page-session retry when verifier handoff completion is ambiguous', async () => {
    const fetch = prepareAuthorizedAuth();

    const handoffAttempted = vi.fn();
    render(<OwnerCanaryApp loadRuntime={async () => handoffFailingRuntime(handoffAttempted)} />);
    const nonce = await screen.findByLabelText('Private evidence nonce');
    const plan = screen.getByLabelText('Reviewed admission-plan digest');
    const routes = screen.getByLabelText('Private route-set commitment');
    const confirmation = screen.getByRole('checkbox', {
      name: 'I approve this run to mutate an already-admitted live production player.',
    });
    const begin = screen.getByRole('button', { name: 'Begin reviewed canary' });

    fireEvent.change(nonce, { target: { value: PRIVATE_NONCE } });
    fireEvent.change(plan, { target: { value: PLAN_DIGEST } });
    fireEvent.change(routes, { target: { value: ROUTE_SET_COMMITMENT } });
    fireEvent.click(confirmation);
    fireEvent.click(begin);

    for (let stageNumber = 1; stageNumber <= OWNER_CANARY_STAGES.length; stageNumber += 1) {
      await screen.findByText(`STAGE ${stageNumber} OF 10`);
      if (stageNumber === 7) {
        expect(screen.getByText(/urgent recall/i).textContent)
          .toContain('every dispatched worker');
      }
      fireEvent.click(screen.getByRole('button', {
        name: 'Authenticate and run this stage',
      }));
    }

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(
      'Verifier handoff completion could not be confirmed.',
    ));
    expect(handoffAttempted).toHaveBeenCalledOnce();
    expect(getQuickAuthToken).toHaveBeenCalledTimes(10);
    expect(fetch).toHaveBeenCalledTimes(10);

    fireEvent.change(nonce, { target: { value: PRIVATE_NONCE } });
    fireEvent.change(plan, { target: { value: PLAN_DIGEST } });
    fireEvent.change(routes, { target: { value: ROUTE_SET_COMMITMENT } });
    fireEvent.click(confirmation);
    expect((begin as HTMLButtonElement).disabled).toBe(true);
  });
});
