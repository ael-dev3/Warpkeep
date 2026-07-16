import { describe, expect, it } from 'vitest';

import {
  createFarcasterAuthMachineState,
  farcasterAuthMachineReducer,
  type FarcasterAuthMachineAction,
  type FarcasterAuthMachineState
} from '../src/farcaster/farcasterAuthMachine';
import type {
  FarcasterAuthError,
  PublicFarcasterIdentity,
  VerifiedFarcasterIdentity
} from '../src/farcaster/farcasterAuthTypes';

const expiresAt = 1_800_000_000_000;

const identity: VerifiedFarcasterIdentity = {
  fid: 12_345,
  username: 'keeper',
  displayName: 'The Keeper',
  pfpUrl: 'https://example.com/keeper.png',
  custody: '0x1234',
  verifications: ['0xabcd'],
  authMethod: 'authAddress',
  verifiedAt: 1_700_000_000_000
};

const publicVerifiedIdentity: PublicFarcasterIdentity = {
  fid: identity.fid,
  username: identity.username,
  displayName: identity.displayName,
  pfpUrl: identity.pfpUrl,
  verifications: [],
  verifiedAt: identity.verifiedAt
};

const expiredError: FarcasterAuthError = {
  code: 'expired',
  message: 'The Farcaster request was not approved in time.'
};

const relayError: FarcasterAuthError = {
  code: 'relay',
  message: 'The Farcaster relay is temporarily unavailable.'
};

function reduce(
  state: FarcasterAuthMachineState,
  ...actions: readonly FarcasterAuthMachineAction[]
) {
  return actions.reduce(farcasterAuthMachineReducer, state);
}

function begin(generation = 1): FarcasterAuthMachineState {
  return farcasterAuthMachineReducer(createFarcasterAuthMachineState(), {
    type: 'begin',
    generation
  });
}

function awaiting(generation = 1): FarcasterAuthMachineState {
  return farcasterAuthMachineReducer(begin(generation), {
    type: 'channel-ready',
    generation,
    channelUrl: 'https://farcaster.example/sign-in/channel',
    expiresAt
  });
}

function verifying(generation = 1): FarcasterAuthMachineState {
  return farcasterAuthMachineReducer(awaiting(generation), {
    type: 'verifying',
    generation
  });
}

function liveAuthenticated(generation = 1) {
  return farcasterAuthMachineReducer(verifying(generation), {
    type: 'authenticated',
    generation,
    identity,
    assurance: 'live-client-verified'
  });
}

describe('farcasterAuthMachineReducer', () => {
  it('starts anonymous with no session or request material', () => {
    const state = createFarcasterAuthMachineState();

    expect(state).toEqual({
      generation: 0,
      view: { phase: 'anonymous' }
    });
    expect(Object.keys(state.view)).toEqual(['phase']);
  });

  it('performs the legal live-authentication path with lazy QR presentation', () => {
    const creating = begin();
    expect(creating).toEqual({
      generation: 1,
      view: { phase: 'creating-channel' }
    });

    const waiting = farcasterAuthMachineReducer(creating, {
      type: 'channel-ready',
      generation: 1,
      channelUrl: 'https://farcaster.example/sign-in/channel',
      expiresAt
    });
    expect(waiting).toEqual({
      generation: 1,
      view: {
        phase: 'awaiting-approval',
        channelUrl: 'https://farcaster.example/sign-in/channel',
        qr: { state: 'not-requested' },
        expiresAt
      }
    });

    const loadingQr = farcasterAuthMachineReducer(waiting, {
      type: 'qr-loading',
      generation: 1
    });
    const readyQr = farcasterAuthMachineReducer(loadingQr, {
      type: 'qr-ready',
      generation: 1,
      dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+'
    });
    expect(readyQr.view).toMatchObject({
      phase: 'awaiting-approval',
      qr: { state: 'ready', dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' }
    });

    const checking = farcasterAuthMachineReducer(readyQr, {
      type: 'verifying',
      generation: 1
    });
    expect(checking).toEqual({
      generation: 1,
      view: { phase: 'verifying', expiresAt }
    });

    const identityVerified = farcasterAuthMachineReducer(checking, {
      type: 'identity-verified',
      generation: 1,
      identity: publicVerifiedIdentity
    });
    expect(identityVerified).toEqual({
      generation: 1,
      view: {
        phase: 'verifying',
        expiresAt,
        identity: {
          fid: identity.fid,
          username: identity.username,
          displayName: identity.displayName,
          pfpUrl: identity.pfpUrl,
          verifications: [],
          verifiedAt: identity.verifiedAt
        }
      }
    });

    const authenticated = farcasterAuthMachineReducer(identityVerified, {
      type: 'authenticated',
      generation: 1,
      identity,
      assurance: 'live-client-verified'
    });
    expect(authenticated).toEqual({
      generation: 1,
      view: {
        phase: 'authenticated',
        identity: {
          fid: identity.fid,
          username: identity.username,
          displayName: identity.displayName,
          pfpUrl: identity.pfpUrl,
          verifications: [],
          verifiedAt: identity.verifiedAt
        },
        assurance: 'live-client-verified'
      }
    });
  });

  it('keeps a valid channel awaiting approval when QR rendering fails or retries', () => {
    const loading = farcasterAuthMachineReducer(awaiting(), {
      type: 'qr-loading',
      generation: 1
    });
    const failed = farcasterAuthMachineReducer(loading, {
      type: 'qr-failed',
      generation: 1
    });
    expect(failed.view).toMatchObject({
      phase: 'awaiting-approval',
      qr: { state: 'error' }
    });

    const retrying = farcasterAuthMachineReducer(failed, {
      type: 'qr-loading',
      generation: 1
    });
    expect(retrying.view).toMatchObject({
      phase: 'awaiting-approval',
      qr: { state: 'loading' }
    });
    expect(farcasterAuthMachineReducer(retrying, {
      type: 'qr-ready',
      generation: 1,
      dataUrl: 'data:image/png;base64,qr'
    }).view).toMatchObject({
      phase: 'awaiting-approval',
      qr: { state: 'ready', dataUrl: 'data:image/png;base64,qr' }
    });
  });

  it.each([
    ['creating-channel', begin()],
    ['awaiting-approval', awaiting()],
    ['verifying', verifying()]
  ])('allows %s to expire and removes channel presentation data', (_phase, state) => {
    const expired = farcasterAuthMachineReducer(state, {
      type: 'expired',
      generation: 1,
      error: expiredError
    });

    expect(expired).toEqual({
      generation: 1,
      view: { phase: 'expired', error: expiredError }
    });
    expect(JSON.stringify(expired)).not.toContain('sign-in/channel');
    expect(JSON.stringify(expired)).not.toContain('image/svg');
  });

  it.each([
    ['creating-channel', begin()],
    ['awaiting-approval', awaiting()],
    ['verifying', verifying()]
  ])('allows %s to fail with a sanitized public error', (_phase, state) => {
    const failed = farcasterAuthMachineReducer(state, {
      type: 'failed',
      generation: 1,
      error: relayError
    });

    expect(failed).toEqual({
      generation: 1,
      view: { phase: 'error', error: relayError }
    });
  });

  it.each([
    ['creating-channel', begin()],
    ['awaiting-approval', awaiting()],
    ['verifying', verifying()],
    [
      'expired',
      farcasterAuthMachineReducer(awaiting(), {
        type: 'expired',
        generation: 1,
        error: expiredError
      })
    ],
    [
      'error',
      farcasterAuthMachineReducer(awaiting(), {
        type: 'failed',
        generation: 1,
        error: relayError
      })
    ]
  ])('cancels %s back to anonymous', (_phase, state) => {
    expect(farcasterAuthMachineReducer(state, {
      type: 'cancel',
      generation: 1
    })).toEqual({
      generation: 2,
      view: { phase: 'anonymous' }
    });
  });

  it('distinguishes a live verification from an explicitly restored device record', () => {
    const live = liveAuthenticated();
    expect(live.view).toMatchObject({
      phase: 'authenticated',
      assurance: 'live-client-verified'
    });
    expect(live.view).not.toHaveProperty('expiresAt');

    const restored = farcasterAuthMachineReducer(createFarcasterAuthMachineState(), {
      type: 'restore',
      identity: {
        fid: identity.fid,
        username: identity.username,
        displayName: identity.displayName,
        pfpUrl: identity.pfpUrl,
        verifications: [],
        verifiedAt: identity.verifiedAt
      },
      expiresAt
    });
    expect(restored).toEqual({
      generation: 0,
      view: {
        phase: 'authenticated',
        identity: {
          fid: identity.fid,
          username: identity.username,
          displayName: identity.displayName,
          pfpUrl: identity.pfpUrl,
          verifications: [],
          verifiedAt: identity.verifiedAt
        },
        assurance: 'bridge-oidc-alpha',
        expiresAt,
        sessionExpiresAt: expiresAt
      }
    });

    expect(farcasterAuthMachineReducer(restored, {
      type: 'sign-out',
      generation: 0
    })).toEqual({ generation: 1, view: { phase: 'anonymous' } });
  });

  it('generation-gates cookie refresh results and invalidates them on sign-out', () => {
    const authenticated = farcasterAuthMachineReducer(verifying(), {
      type: 'authenticated',
      generation: 1,
      identity,
      assurance: 'bridge-oidc-alpha',
      expiresAt,
      sessionExpiresAt: expiresAt + 1_000
    });
    const signedOut = farcasterAuthMachineReducer(authenticated, {
      type: 'sign-out',
      generation: 1
    });
    expect(signedOut).toEqual({ generation: 2, view: { phase: 'anonymous' } });

    expect(farcasterAuthMachineReducer(signedOut, {
      type: 'session-authorized',
      generation: 1,
      identity,
      expiresAt,
      sessionExpiresAt: expiresAt + 1_000
    })).toBe(signedOut);
    expect(farcasterAuthMachineReducer(verifying(), {
      type: 'session-pending',
      generation: 1,
      identity,
      sessionExpiresAt: expiresAt + 1_000
    })).toEqual(verifying());
  });

  it('ignores stale results from superseded request generations', () => {
    const secondRequest = farcasterAuthMachineReducer(
      farcasterAuthMachineReducer(awaiting(), {
        type: 'cancel',
        generation: 1
      }),
      { type: 'begin', generation: 3 }
    );

    const staleActions: readonly FarcasterAuthMachineAction[] = [
      {
        type: 'channel-ready',
        generation: 1,
        channelUrl: 'https://stale.example',
        expiresAt
      },
      { type: 'qr-loading', generation: 1 },
      { type: 'qr-ready', generation: 1, dataUrl: 'data:image/png;base64,stale' },
      { type: 'qr-failed', generation: 1 },
      { type: 'verifying', generation: 1 },
      { type: 'identity-verified', generation: 1, identity: publicVerifiedIdentity },
      {
        type: 'authenticated',
        generation: 1,
        identity,
        assurance: 'live-client-verified'
      },
      { type: 'expired', generation: 1, error: expiredError },
      { type: 'failed', generation: 1, error: relayError },
      { type: 'cancel', generation: 1 },
      { type: 'sign-out', generation: 1 }
    ];

    staleActions.forEach((action) => {
      expect(farcasterAuthMachineReducer(secondRequest, action)).toBe(secondRequest);
    });
  });

  it('ignores duplicate starts, including a higher generation while active', () => {
    const creating = begin();

    expect(farcasterAuthMachineReducer(creating, {
      type: 'begin',
      generation: 1
    })).toBe(creating);
    expect(farcasterAuthMachineReducer(creating, {
      type: 'begin',
      generation: 2
    })).toBe(creating);
  });

  it('starts a fresh generation after cancel, expiry, or error', () => {
    const cancelled = farcasterAuthMachineReducer(awaiting(), {
      type: 'cancel',
      generation: 1
    });
    const expired = farcasterAuthMachineReducer(awaiting(), {
      type: 'expired',
      generation: 1,
      error: expiredError
    });
    const failed = farcasterAuthMachineReducer(awaiting(), {
      type: 'failed',
      generation: 1,
      error: relayError
    });

    for (const [terminalState, generation] of [
      [cancelled, 3],
      [expired, 2],
      [failed, 2]
    ] as const) {
      expect(farcasterAuthMachineReducer(terminalState, {
        type: 'begin',
        generation
      })).toEqual({
        generation,
        view: { phase: 'creating-channel' }
      });
    }
  });

  it('returns the same object for illegal phase transitions', () => {
    const anonymous = createFarcasterAuthMachineState();
    const creating = begin();
    const waiting = awaiting();
    const authenticated = liveAuthenticated();

    const cases: ReadonlyArray<readonly [FarcasterAuthMachineState, FarcasterAuthMachineAction]> = [
      [anonymous, { type: 'verifying', generation: 0 }],
      [anonymous, { type: 'identity-verified', generation: 0, identity: publicVerifiedIdentity }],
      [creating, { type: 'verifying', generation: 1 }],
      [waiting, { type: 'identity-verified', generation: 1, identity: publicVerifiedIdentity }],
      [waiting, {
        type: 'authenticated',
        generation: 1,
        identity,
        assurance: 'live-client-verified'
      }],
      [authenticated, { type: 'cancel', generation: 1 }],
      [authenticated, { type: 'failed', generation: 1, error: relayError }],
      [anonymous, { type: 'sign-out', generation: 0 }]
    ];

    cases.forEach(([state, action]) => {
      expect(farcasterAuthMachineReducer(state, action)).toBe(state);
    });
  });

  it('rejects invalid generations and malformed public channel or QR presentation data', () => {
    const initial = createFarcasterAuthMachineState();
    for (const generation of [-1, 0, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(farcasterAuthMachineReducer(initial, {
        type: 'begin',
        generation
      })).toBe(initial);
    }

    const creating = begin();
    const malformedActions: readonly FarcasterAuthMachineAction[] = [
      {
        type: 'channel-ready',
        generation: 1,
        channelUrl: '',
        expiresAt
      },
      {
        type: 'channel-ready',
        generation: 1,
        channelUrl: 'https://farcaster.example/sign-in/channel',
        expiresAt: Number.NaN
      }
    ];

    malformedActions.forEach((action) => {
      expect(farcasterAuthMachineReducer(creating, action)).toBe(creating);
    });

    const waiting = awaiting();
    expect(farcasterAuthMachineReducer(waiting, {
      type: 'qr-ready',
      generation: 1,
      dataUrl: 'data:image/png;base64,qr'
    })).toBe(waiting);
    const loading = farcasterAuthMachineReducer(waiting, {
      type: 'qr-loading',
      generation: 1
    });
    expect(farcasterAuthMachineReducer(loading, {
      type: 'qr-ready',
      generation: 1,
      dataUrl: ''
    })).toBe(loading);
  });

  it('does not authenticate malformed identities', () => {
    const checking = verifying();
    const malformedIdentities = [
      { ...identity, fid: 0 },
      { ...identity, fid: 1.5 },
      { ...identity, fid: Number.NaN },
      { ...identity, verifiedAt: Number.POSITIVE_INFINITY },
      { ...identity, verifications: null }
    ];

    malformedIdentities.forEach((malformedIdentity) => {
      expect(farcasterAuthMachineReducer(checking, {
        type: 'identity-verified',
        generation: 1,
        identity: malformedIdentity as unknown as PublicFarcasterIdentity
      })).toBe(checking);
      expect(farcasterAuthMachineReducer(checking, {
        type: 'authenticated',
        generation: 1,
        identity: malformedIdentity as unknown as VerifiedFarcasterIdentity,
        assurance: 'live-client-verified'
      })).toBe(checking);
    });
  });

  it('copies only proof-free public fields into channel, QR, identity, and error state', () => {
    const secret = 'SECRET_PROOF_SENTINEL';
    const actionWithPrivateExtras = {
      type: 'channel-ready',
      generation: 1,
      channelUrl: 'https://farcaster.example/sign-in/channel',
      expiresAt,
      channelToken: secret,
      nonce: secret,
      message: secret,
      signature: secret
    } as unknown as FarcasterAuthMachineAction;

    const waiting = farcasterAuthMachineReducer(begin(), actionWithPrivateExtras);
    expect(waiting.view).toEqual({
      phase: 'awaiting-approval',
      channelUrl: 'https://farcaster.example/sign-in/channel',
      qr: { state: 'not-requested' },
      expiresAt
    });
    expect(JSON.stringify(waiting)).not.toContain(secret);

    const qrReadyWithPrivateExtras = {
      type: 'qr-ready',
      generation: 1,
      dataUrl: 'data:image/png;base64,public-qr',
      channelToken: secret,
      nonce: secret,
      message: secret,
      signature: secret
    } as unknown as FarcasterAuthMachineAction;
    const readyQr = reduce(
      waiting,
      { type: 'qr-loading', generation: 1 },
      qrReadyWithPrivateExtras
    );
    expect(readyQr.view).toMatchObject({
      phase: 'awaiting-approval',
      qr: { state: 'ready', dataUrl: 'data:image/png;base64,public-qr' }
    });
    expect(JSON.stringify(readyQr)).not.toContain(secret);

    const identityWithPrivateExtras = {
      ...identity,
      verifications: [...identity.verifications],
      channelToken: secret,
      nonce: secret,
      message: secret,
      signature: secret
    } as unknown as VerifiedFarcasterIdentity;
    const verifiedPresentation = reduce(
      readyQr,
      { type: 'verifying', generation: 1 },
      {
        type: 'identity-verified',
        generation: 1,
        identity: identityWithPrivateExtras as unknown as PublicFarcasterIdentity
      }
    );
    expect(verifiedPresentation.view).toMatchObject({
      phase: 'verifying',
      identity: {
        fid: identity.fid,
        username: identity.username,
        displayName: identity.displayName,
        pfpUrl: identity.pfpUrl,
        verifications: []
      }
    });
    expect(JSON.stringify(verifiedPresentation)).not.toContain(secret);

    const authenticated = farcasterAuthMachineReducer(
      verifiedPresentation,
      {
        type: 'authenticated',
        generation: 1,
        identity: identityWithPrivateExtras,
        assurance: 'live-client-verified'
      }
    );
    expect(Object.keys(authenticated.view).sort()).toEqual(['assurance', 'identity', 'phase']);
    expect(JSON.stringify(authenticated)).not.toContain('channelUrl');
    expect(JSON.stringify(authenticated)).not.toContain('data:image');
    expect(JSON.stringify(authenticated)).not.toContain(secret);

    const errorWithPrivateExtras = {
      ...relayError,
      channelToken: secret,
      nonce: secret,
      messageProof: secret,
      signature: secret
    } as unknown as FarcasterAuthError;
    const failed = farcasterAuthMachineReducer(awaiting(), {
      type: 'failed',
      generation: 1,
      error: errorWithPrivateExtras
    });
    expect(failed.view).toEqual({ phase: 'error', error: relayError });
    expect(JSON.stringify(failed)).not.toContain(secret);
  });
});
