import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GREATER_REALM_SERVER_PRESENTATION_ALLOWED,
  GreaterRealmTransportUnavailableError,
  createGreaterRealmProcedureTransport,
  createPtrGreaterRealmProcedureTransport,
} from '../src/greater-realm/greaterRealmTransport';
import {
  PTR_REALM_AUDIENCE,
  PTR_REALM_ID,
  createPtrRealmAuthClient,
  type PtrRealmAuthority,
} from '../src/ptr/ptrRealmAuthClient';
import { resolvePtrRealmWorldSceneStrategy } from '../src/components/realm/greaterRealmSceneStrategy';
import { resolveGreaterRealmWorldViewPolicy } from '../src/components/realm/greaterRealmWorldViewPolicy';
import type { GreaterRealmProviderBridge } from '../src/spacetime/greaterRealmProviderBridge';
import { resolvePtrRealmPresentation } from '../src/ptr/ptrRealmPresentationPolicy';
import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';

const NOW = 1_800_000_000_000;
const FID = 12_345;
const DATABASE = '1'.repeat(64);

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function ptrJwt(): string {
  const issuedAt = NOW / 1_000;
  return [
    base64Url({ alg: 'ES256', typ: 'JWT', kid: 'warpkeep-test' }),
    base64Url({
      iss: 'https://auth.warpkeep.com',
      sub: `farcaster:${FID}`,
      aud: [PTR_REALM_AUDIENCE],
      token_type: 'spacetime-access',
      auth_version: 2,
      realm_id: PTR_REALM_ID,
      fid: String(FID),
      auth_epoch: 1,
      roles: ['warpkeep-ptr-owner'],
      iat: issuedAt,
      nbf: issuedAt,
      exp: issuedAt + 120,
      session_iat: issuedAt,
      session_exp: issuedAt + 120,
      jti: 'A'.repeat(24),
    }),
    'signature',
  ].join('.');
}

async function authority(): Promise<PtrRealmAuthority> {
  const accessToken = ptrJwt();
  const client = createPtrRealmAuthClient({
    expectedDatabaseIdentity: DATABASE,
    now: () => NOW,
    fetch: vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      status: 'authorized',
      realmId: PTR_REALM_ID,
      identity: { fid: FID },
      databaseIdentity: DATABASE,
      accessToken,
      tokenType: 'spacetime-access',
      accessExpiresAt: NOW + 120_000,
    }), {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json',
      },
    })) as typeof fetch,
  });
  return client.exchangeQuickAuth('quick.auth.token');
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PTR Greater Realm transport boundary', () => {
  it('keeps the Genesis server gate closed and accepts only a live branded PTR authority', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const ptrAuthority = await authority();
    const call = vi.fn(async () => ({}));
    const invoker = Object.freeze({ call });
    const signal = new AbortController().signal;

    expect(GREATER_REALM_SERVER_PRESENTATION_ALLOWED).toBe(false);
    await expect(
      createGreaterRealmProcedureTransport(invoker).getBootstrap(signal),
    ).rejects.toBeInstanceOf(GreaterRealmTransportUnavailableError);
    expect(call).not.toHaveBeenCalled();

    await expect(
      createPtrGreaterRealmProcedureTransport(invoker, { ...ptrAuthority }).getBootstrap(signal),
    ).rejects.toBeInstanceOf(GreaterRealmTransportUnavailableError);
    expect(call).not.toHaveBeenCalled();

    await expect(
      createPtrGreaterRealmProcedureTransport(invoker, ptrAuthority).getBootstrap(signal),
    ).rejects.not.toBeInstanceOf(GreaterRealmTransportUnavailableError);
    expect(call).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW + 120_000);
    await expect(
      createPtrGreaterRealmProcedureTransport(invoker, ptrAuthority).getBootstrap(signal),
    ).rejects.toBeInstanceOf(GreaterRealmTransportUnavailableError);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('selects the PTR world only for the same live branded owner authority', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const ptrAuthority = await authority();
    const bridge = Object.freeze({
      phase: 'available',
      presentationAllowed: true,
      sessionGeneration: 1,
      createRuntime: vi.fn(),
    }) as unknown as GreaterRealmProviderBridge;
    const input = Object.freeze({ bridge, legacyAuthorityActive: false });

    expect(resolvePtrRealmWorldSceneStrategy(input, { ...ptrAuthority })).toEqual({
      kind: 'connection-hold',
      reason: 'legacy-authority-inactive',
    });
    expect(resolvePtrRealmWorldSceneStrategy(input, ptrAuthority)).toEqual(
      expect.objectContaining({ kind: 'greater-realm', sessionGeneration: 1 }),
    );

    vi.setSystemTime(NOW + 120_000);
    expect(resolvePtrRealmWorldSceneStrategy(input, ptrAuthority)).toEqual({
      kind: 'connection-hold',
      reason: 'legacy-authority-inactive',
    });
  });

  it('accepts only an i32 virtual view anchor with no Genesis surface attached', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const ptrAuthority = await authority();
    const viewAnchor = Object.freeze({ castleId: FID, q: -18_240, r: 9_120 });

    expect(resolvePtrRealmPresentation({
      authority: ptrAuthority,
      viewAnchor,
      legacySurfacePresent: false,
    })).toEqual({ authority: ptrAuthority, viewAnchor });
    expect(resolvePtrRealmPresentation({
      authority: { ...ptrAuthority },
      viewAnchor,
      legacySurfacePresent: false,
    })).toBeNull();
    expect(resolvePtrRealmPresentation({
      authority: ptrAuthority,
      viewAnchor,
      legacySurfacePresent: true,
    })).toBeNull();
    expect(resolvePtrRealmPresentation({
      authority: ptrAuthority,
      viewAnchor: { ...viewAnchor, q: 2_147_483_648 },
      legacySurfacePresent: false,
    })).toBeNull();
    expect(resolvePtrRealmPresentation({
      authority: ptrAuthority,
      viewAnchor: { ...viewAnchor, castleId: FID + 1 },
      legacySurfacePresent: false,
    })).toBeNull();
  });

  it('converts PTR atlas-cell anchors to the chunk-bin coordinates expected by window reads', () => {
    const viewAnchor = Object.freeze({ castleId: FID, q: -16, r: 29 });
    const policy = resolveGreaterRealmWorldViewPolicy({
      atlasQ: viewAnchor.q,
      atlasR: viewAnchor.r,
      viewportWidth: 1_440,
      coarsePointer: false,
      farcasterMiniApp: false,
      resolvedGraphicsQuality: 'balanced',
      reducedMotion: false,
    });

    expect(policy).toMatchObject({ centerQ: -2, centerR: 1 });
  });

  it('labels a rejected PTR renderer as PTR rather than Genesis 001', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const ptrAuthority = await authority();

    render(createElement(RealmMapScreen, {
      identity: { fid: FID },
      onRequestReturn: vi.fn(),
      ptrRealmAuthority: ptrAuthority,
      ptrViewAnchor: { castleId: FID + 1, q: 0, r: 0 },
    }));

    expect(screen.getByRole('alert').textContent).toMatch(/PTR is unavailable/i);
    expect(screen.getByRole('alert').textContent).not.toMatch(/Genesis 001/i);
  });
});
