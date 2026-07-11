import { describe, expect, it } from 'vitest';

import {
  createFarcasterAuthMachineState,
  farcasterAuthMachineReducer,
  type FarcasterAuthMachineAction,
  type FarcasterAuthMachineState
} from '../src/farcaster/farcasterAuthMachine';
import type {
  FarcasterAuthError,
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
    qrDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
    expiresAt
  });
}

function verifying(generation = 1): FarcasterAuthMachineState {
  return farcasterAuthMachineReducer(awaiting(generation), {
    type: 'verifying',
    generation
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

  it('performs the complete legal authentication path', () => {
    const creating = begin();
    expect(creating).toEqual({
      generation: 1,
      view: { phase: 'creating-channel' }
    });

    const waiting = farcasterAuthMachineReducer(creating, {
      type: 'channel-ready',
      generation: 1,
      channelUrl: 'https://farcaster.example/sign-in/channel',
      qrDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
      expiresAt
    });
    expect(waiting).toEqual({
      generation: 1,
      view: {
        phase: 'awaiting-approval',
        channelUrl: 'https://farcaster.example/sign-in/channel',
        qrDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
        expiresAt
      }
    });

    const checking = farcasterAuthMachineReducer(waiting, {
      type: 'verifying',
      generation: 1
    });
    expect(checking).toEqual({
      generation: 1,
      view: { phase: 'verifying', expiresAt }
    });

    const authenticated = farcasterAuthMachineReducer(checking, {
      type: 'authenticated',
      generation: 1,
      identity
    });
    expect(authenticated).toEqual({
      generation: 1,
      view: { phase: 'authenticated', identity }
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
      generation: 1,
      view: { phase: 'anonymous' }
    });
  });

  it('signs out only from authenticated and clears the identity', () => {
    const authenticated = farcasterAuthMachineReducer(verifying(), {
      type: 'authenticated',
      generation: 1,
      identity
    });
    const signedOut = farcasterAuthMachineReducer(authenticated, {
      type: 'sign-out',
      generation: 1
    });

    expect(signedOut).toEqual({
      generation: 1,
      view: { phase: 'anonymous' }
    });
    expect(JSON.stringify(signedOut)).not.toContain(String(identity.fid));
  });

  it('ignores stale results from superseded request generations', () => {
    const secondRequest = farcasterAuthMachineReducer(
      farcasterAuthMachineReducer(awaiting(), {
        type: 'cancel',
        generation: 1
      }),
      { type: 'begin', generation: 2 }
    );

    const staleActions: readonly FarcasterAuthMachineAction[] = [
      {
        type: 'channel-ready',
        generation: 1,
        channelUrl: 'https://stale.example',
        qrDataUrl: 'data:image/png;base64,stale',
        expiresAt
      },
      { type: 'verifying', generation: 1 },
      { type: 'authenticated', generation: 1, identity },
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

    for (const terminalState of [cancelled, expired, failed]) {
      expect(farcasterAuthMachineReducer(terminalState, {
        type: 'begin',
        generation: 2
      })).toEqual({
        generation: 2,
        view: { phase: 'creating-channel' }
      });
    }
  });

  it('returns the same object for illegal phase transitions', () => {
    const anonymous = createFarcasterAuthMachineState();
    const creating = begin();
    const waiting = awaiting();
    const authenticated = farcasterAuthMachineReducer(verifying(), {
      type: 'authenticated',
      generation: 1,
      identity
    });

    const cases: ReadonlyArray<readonly [FarcasterAuthMachineState, FarcasterAuthMachineAction]> = [
      [anonymous, { type: 'verifying', generation: 0 }],
      [creating, { type: 'verifying', generation: 1 }],
      [waiting, { type: 'authenticated', generation: 1, identity }],
      [authenticated, { type: 'cancel', generation: 1 }],
      [authenticated, { type: 'failed', generation: 1, error: relayError }],
      [anonymous, { type: 'sign-out', generation: 0 }]
    ];

    cases.forEach(([state, action]) => {
      expect(farcasterAuthMachineReducer(state, action)).toBe(state);
    });
  });

  it('rejects invalid generations and malformed channel presentation data', () => {
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
        qrDataUrl: 'data:image/png;base64,qr',
        expiresAt
      },
      {
        type: 'channel-ready',
        generation: 1,
        channelUrl: 'https://farcaster.example/sign-in/channel',
        qrDataUrl: '',
        expiresAt
      },
      {
        type: 'channel-ready',
        generation: 1,
        channelUrl: 'https://farcaster.example/sign-in/channel',
        qrDataUrl: 'data:image/png;base64,qr',
        expiresAt: Number.NaN
      }
    ];

    malformedActions.forEach((action) => {
      expect(farcasterAuthMachineReducer(creating, action)).toBe(creating);
    });
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
        type: 'authenticated',
        generation: 1,
        identity: malformedIdentity as unknown as VerifiedFarcasterIdentity
      })).toBe(checking);
    });
  });

  it('copies only the proof-free channel view fields into public state', () => {
    const secret = 'SECRET_PROOF_SENTINEL';
    const actionWithPrivateExtras = {
      type: 'channel-ready',
      generation: 1,
      channelUrl: 'https://farcaster.example/sign-in/channel',
      qrDataUrl: 'data:image/png;base64,public-qr',
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
      qrDataUrl: 'data:image/png;base64,public-qr',
      expiresAt
    });
    expect(JSON.stringify(waiting)).not.toContain(secret);

    const identityWithPrivateExtras = {
      ...identity,
      verifications: [...identity.verifications],
      channelToken: secret,
      nonce: secret,
      message: secret,
      signature: secret
    } as unknown as VerifiedFarcasterIdentity;
    const authenticated = reduce(
      waiting,
      { type: 'verifying', generation: 1 },
      { type: 'authenticated', generation: 1, identity: identityWithPrivateExtras }
    );
    expect(Object.keys(authenticated.view).sort()).toEqual(['identity', 'phase']);
    expect(JSON.stringify(authenticated)).not.toContain('channelUrl');
    expect(JSON.stringify(authenticated)).not.toContain('qrDataUrl');
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
