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
    evidenceApi: Object.freeze({
      run: async () => {
        throw new Error('synthetic pre-authority failure');
      },
    }),
    openAuthority: async () => Object.freeze({}),
    closeAuthority: async () => undefined,
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
    evidenceApi,
    openAuthority: async () => Object.freeze({}),
    closeAuthority: async () => undefined,
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
    evidenceApi,
    openAuthority: async () => Object.freeze({}),
    closeAuthority: async () => undefined,
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
    evidenceApi,
    openAuthority: async () => Object.freeze({}),
    closeAuthority: async () => undefined,
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
      name: 'I approve this run to create and mutate live production player state.',
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

  it('permanently consumes the page session after a failed run attempt', async () => {
    render(<OwnerCanaryApp loadRuntime={async () => failingRuntime()} />);

    const nonce = await screen.findByLabelText('Private evidence nonce');
    const plan = screen.getByLabelText('Reviewed admission-plan digest');
    const routes = screen.getByLabelText('Private route-set commitment');
    const confirmation = screen.getByRole('checkbox', {
      name: 'I approve this run to create and mutate live production player state.',
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
      name: 'I approve this run to create and mutate live production player state.',
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

  it('does not retry after cancellation follows an accepted stage mutation', async () => {
    prepareAuthorizedAuth();
    const mutationAccepted = vi.fn();
    render(<OwnerCanaryApp loadRuntime={async () => cancellableRuntime(mutationAccepted)} />);

    const nonce = await screen.findByLabelText('Private evidence nonce');
    const plan = screen.getByLabelText('Reviewed admission-plan digest');
    const routes = screen.getByLabelText('Private route-set commitment');
    const confirmation = screen.getByRole('checkbox', {
      name: 'I approve this run to create and mutate live production player state.',
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
      name: 'I approve this run to create and mutate live production player state.',
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
