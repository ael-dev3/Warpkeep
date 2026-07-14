import { describe, expect, it, vi } from 'vitest';

const officialClientMocks = vi.hoisted(() => ({
  createAppClient: vi.fn(),
  viemConnector: vi.fn()
}));

vi.mock('@farcaster/auth-client', () => ({
  createAppClient: officialClientMocks.createAppClient,
  viemConnector: officialClientMocks.viemConnector
}));

import {
  FARCASTER_AUTH_RELAY_URL,
  FARCASTER_OPTIMISM_RPC_URL,
  FarcasterAuthClientError,
  createFarcasterSessionAuthority,
  getDefaultFarcasterAppClient,
  getDefaultFarcasterSessionAuthority,
  toFarcasterAuthError,
  type FarcasterAppClientPort
} from '../src/farcaster/farcasterAuthClient';
import {
  FARCASTER_AUTH_REQUEST_TTL_MS,
  type FarcasterSecureRandomSource
} from '../src/farcaster/farcasterAuthContext';
import type {
  FarcasterAuthContext,
  FarcasterCompletedChannelStatus,
  FarcasterExpectedSignInRequest
} from '../src/farcaster/farcasterAuthTypes';

const NOW = Date.UTC(2026, 6, 11, 10, 0, 0);
const REQUEST_ID = 'd6d120e3-f120-4fb8-9f00-29bb7d46a111';
const NONCE = 'ab'.repeat(24);
const CHANNEL_TOKEN = ['fixture', 'channel', 'token', 'never', 'secret'].join('-');
const SIGNATURE = `0x${'11'.repeat(65)}` as const;
const CONTEXT: FarcasterAuthContext = Object.freeze({
  domain: 'ael-dev3.github.io',
  siweUri: 'https://ael-dev3.github.io/Warpkeep/'
});

function randomSource(): FarcasterSecureRandomSource {
  return {
    randomUUID: () => REQUEST_ID,
    getRandomValues: ((array: Uint8Array) => {
      array.fill(0xab);
      return array;
    }) as Crypto['getRandomValues']
  };
}

function success(data: Record<string, unknown>, status = 200) {
  return {
    isError: false,
    response: { ok: status >= 200 && status < 300, status },
    data
  };
}

function channelUrl(overrides: Partial<Record<string, string>> = {}) {
  const params = new URLSearchParams({
    channelToken: CHANNEL_TOKEN,
    nonce: NONCE,
    siweUri: CONTEXT.siweUri,
    domain: CONTEXT.domain,
    ...overrides
  });
  return `farcaster://connect?${params.toString()}`;
}

function verifiedSiweMessage(overrides: Record<string, unknown> = {}) {
  return {
    address: '0x1111111111111111111111111111111111111111',
    chainId: 10,
    domain: CONTEXT.domain,
    expirationTime: new Date(NOW + FARCASTER_AUTH_REQUEST_TTL_MS),
    issuedAt: new Date(NOW),
    nonce: NONCE,
    requestId: REQUEST_ID,
    resources: ['farcaster://fid/12345'],
    uri: CONTEXT.siweUri,
    version: '1',
    ...overrides
  };
}

function verificationResult(
  overrides: Record<string, unknown> = {},
  siweOverrides: Record<string, unknown> = {}
) {
  return {
    isError: false,
    success: true,
    fid: 12_345,
    authMethod: 'authAddress',
    data: verifiedSiweMessage(siweOverrides),
    ...overrides
  };
}

function createClient(overrides: Partial<FarcasterAppClientPort> = {}): FarcasterAppClientPort {
  return {
    createChannel: vi.fn(async () => success({
      channelToken: CHANNEL_TOKEN,
      url: channelUrl(),
      nonce: NONCE
    })),
    status: vi.fn(async () => success({ state: 'pending', nonce: NONCE })),
    verifySignInMessage: vi.fn(async () => verificationResult()),
    ...overrides
  };
}

function completedStatus(
  overrides: Partial<FarcasterCompletedChannelStatus> = {}
): FarcasterCompletedChannelStatus {
  return {
    state: 'completed',
    nonce: NONCE,
    message: 'ael-dev3.github.io wants you to sign in with your Ethereum account',
    signature: SIGNATURE,
    fid: 12_345,
    signatureParams: {
      siweUri: CONTEXT.siweUri,
      domain: CONTEXT.domain,
      nonce: NONCE,
      expirationTime: new Date(NOW + FARCASTER_AUTH_REQUEST_TTL_MS).toISOString(),
      requestId: REQUEST_ID
    },
    acceptAuthAddress: true,
    username: 'warpkeeper',
    displayName: 'Warp Keeper',
    pfpUrl: 'https://images.example/keeper.png',
    custody: '0x1111111111111111111111111111111111111111',
    verifications: ['0x2222222222222222222222222222222222222222'],
    authMethod: 'authAddress',
    ...overrides
  };
}

function expectedRequest(
  overrides: Partial<FarcasterExpectedSignInRequest> = {}
): FarcasterExpectedSignInRequest {
  return {
    nonce: NONCE,
    requestId: REQUEST_ID,
    domain: CONTEXT.domain,
    siweUri: CONTEXT.siweUri,
    createdAt: NOW,
    expiresAt: NOW + FARCASTER_AUTH_REQUEST_TTL_MS,
    ...overrides
  };
}

describe('official Farcaster app client loading', () => {
  it('creates one lazy client with the official relay and an explicit Optimism RPC', async () => {
    const ethereum = { connector: 'optimism' };
    const client = createClient();
    officialClientMocks.viemConnector.mockReturnValue(ethereum);
    officialClientMocks.createAppClient.mockReturnValue(client);

    const first = await getDefaultFarcasterAppClient();
    const second = await getDefaultFarcasterAppClient();

    expect(first).toBe(client);
    expect(second).toBe(client);
    expect(officialClientMocks.viemConnector).toHaveBeenCalledTimes(1);
    expect(officialClientMocks.viemConnector).toHaveBeenCalledWith({
      rpcUrl: FARCASTER_OPTIMISM_RPC_URL
    });
    expect(officialClientMocks.createAppClient).toHaveBeenCalledTimes(1);
    expect(officialClientMocks.createAppClient).toHaveBeenCalledWith({
      relay: FARCASTER_AUTH_RELAY_URL,
      ethereum
    });
  });

  it('returns one stable default authority without eagerly changing its interface', async () => {
    const first = await getDefaultFarcasterSessionAuthority();
    const second = await getDefaultFarcasterSessionAuthority();
    expect(second).toBe(first);
    expect(first).toMatchObject({
      beginSignIn: expect.any(Function),
      getStatus: expect.any(Function),
      verifyCompletedRequest: expect.any(Function)
    });
  });

  it('retries official client construction after one transient failure', async () => {
    vi.resetModules();
    officialClientMocks.createAppClient.mockReset();
    officialClientMocks.viemConnector.mockReset();
    const ethereum = { connector: 'optimism-retry' };
    const client = createClient();
    officialClientMocks.viemConnector.mockReturnValue(ethereum);
    officialClientMocks.createAppClient
      .mockImplementationOnce(() => {
        throw new TypeError('transient chunk failure');
      })
      .mockReturnValue(client);
    const freshModule = await import('../src/farcaster/farcasterAuthClient');

    await expect(freshModule.getDefaultFarcasterAppClient()).rejects.toBeInstanceOf(TypeError);
    await expect(freshModule.getDefaultFarcasterAppClient()).resolves.toBe(client);
    expect(officialClientMocks.createAppClient).toHaveBeenCalledTimes(2);
  });
});

describe('Farcaster channel creation', () => {
  it('creates a five-minute auth-address channel and keeps private material in its result', async () => {
    const client = createClient();
    const authority = createFarcasterSessionAuthority({
      client,
      now: () => NOW,
      randomSource: randomSource()
    });

    const channel = await authority.beginSignIn(CONTEXT);

    expect(vi.mocked(client.createChannel)).toHaveBeenCalledWith({
      siweUri: CONTEXT.siweUri,
      domain: CONTEXT.domain,
      requestId: REQUEST_ID,
      nonce: NONCE,
      expirationTime: new Date(NOW + FARCASTER_AUTH_REQUEST_TTL_MS).toISOString(),
      acceptAuthAddress: true
    });
    expect(channel).toEqual({
      channelToken: CHANNEL_TOKEN,
      url: channelUrl(),
      nonce: NONCE,
      requestId: REQUEST_ID,
      domain: CONTEXT.domain,
      siweUri: CONTEXT.siweUri,
      createdAt: NOW,
      expiresAt: NOW + FARCASTER_AUTH_REQUEST_TTL_MS
    });
    expect(Object.isFrozen(channel)).toBe(true);
  });

  it('uses a bounded bridge challenge for the SIWF nonce and request correlation', async () => {
    const client = createClient();
    const authority = createFarcasterSessionAuthority({ client, now: () => NOW });
    const bridgeChallenge = {
      nonce: NONCE,
      requestId: REQUEST_ID,
      createdAt: NOW,
      expiresAt: NOW + FARCASTER_AUTH_REQUEST_TTL_MS
    } as const;

    await authority.beginSignIn(CONTEXT, bridgeChallenge);

    expect(vi.mocked(client.createChannel)).toHaveBeenCalledWith({
      siweUri: CONTEXT.siweUri,
      domain: CONTEXT.domain,
      requestId: REQUEST_ID,
      nonce: NONCE,
      expirationTime: new Date(NOW + FARCASTER_AUTH_REQUEST_TTL_MS).toISOString(),
      acceptAuthAddress: true
    });
  });

  it.each([
    ['expired', { nonce: NONCE, requestId: REQUEST_ID, createdAt: NOW - 1_000, expiresAt: NOW }],
    ['overlong', {
      nonce: NONCE,
      requestId: REQUEST_ID,
      createdAt: NOW,
      expiresAt: NOW + FARCASTER_AUTH_REQUEST_TTL_MS + 1
    }],
    ['unsafe request id', {
      nonce: NONCE,
      requestId: 'unsafe request id',
      createdAt: NOW,
      expiresAt: NOW + FARCASTER_AUTH_REQUEST_TTL_MS
    }]
  ])('rejects a %s bridge challenge before creating a relay channel', async (_label, challenge) => {
    const client = createClient();
    const authority = createFarcasterSessionAuthority({ client, now: () => NOW });

    await expect(authority.beginSignIn(CONTEXT, challenge)).rejects.toMatchObject({
      code: 'invalid-response'
    });
    expect(client.createChannel).not.toHaveBeenCalled();
  });

  it('accepts the relay current universal web URL and opaque eight-character token', async () => {
    const currentToken = 'Ab12_cd-';
    const currentUrl = `https://farcaster.xyz/~/siwf?channelToken=${currentToken}`;
    const client = createClient({
      createChannel: vi.fn(async () => success({
        channelToken: currentToken,
        url: currentUrl,
        nonce: NONCE
      }))
    });
    const authority = createFarcasterSessionAuthority({
      client,
      now: () => NOW,
      randomSource: randomSource()
    });

    await expect(authority.beginSignIn(CONTEXT)).resolves.toMatchObject({
      channelToken: currentToken,
      url: currentUrl,
      nonce: NONCE
    });
  });

  it('retries a rejected client loader and retains the first successful client', async () => {
    const client = createClient();
    const loadClient = vi.fn()
      .mockRejectedValueOnce(new TypeError('transient client load failure'))
      .mockResolvedValue(client);
    const authority = createFarcasterSessionAuthority({
      loadClient,
      now: () => NOW,
      randomSource: randomSource()
    });

    await expect(authority.beginSignIn(CONTEXT)).rejects.toMatchObject({ code: 'network' });
    await expect(authority.beginSignIn(CONTEXT)).resolves.toMatchObject({
      channelToken: CHANNEL_TOKEN
    });
    await authority.getStatus(CHANNEL_TOKEN);
    expect(loadClient).toHaveBeenCalledTimes(2);
  });

  it('rejects a shape-valid success body delivered with a non-success HTTP status', async () => {
    const client = createClient({
      createChannel: vi.fn(async () => success({
        channelToken: CHANNEL_TOKEN,
        url: channelUrl(),
        nonce: NONCE
      }, 503))
    });
    const authority = createFarcasterSessionAuthority({
      client,
      now: () => NOW,
      randomSource: randomSource()
    });

    await expect(authority.beginSignIn(CONTEXT)).rejects.toMatchObject({
      code: 'relay',
      message: 'The Farcaster relay could not create a sign-in request.'
    });
  });

  it.each([
    ['an HTTPS impostor', 'https://attacker.example/connect'],
    ['an official web URL with extra parameters', `https://farcaster.xyz/~/siwf?channelToken=${CHANNEL_TOKEN}&next=https://attacker.example`],
    ['a token mismatch', channelUrl({ channelToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })],
    ['a nonce mismatch', channelUrl({ nonce: 'cd'.repeat(24) })],
    ['a domain mismatch', channelUrl({ domain: 'attacker.example' })],
    ['a SIWF URI mismatch', channelUrl({ siweUri: 'https://attacker.example/' })],
    ['a URL fragment', `${channelUrl()}#private`]
  ])('rejects %s in a relay-provided channel URL', async (_label, url) => {
    const client = createClient({
      createChannel: vi.fn(async () => success({
        channelToken: CHANNEL_TOKEN,
        url,
        nonce: NONCE
      }))
    });
    const authority = createFarcasterSessionAuthority({
      client,
      now: () => NOW,
      randomSource: randomSource()
    });

    await expect(authority.beginSignIn(CONTEXT)).rejects.toMatchObject({
      code: 'invalid-response',
      message: 'The Farcaster relay returned an invalid sign-in URL.'
    });
  });

  it('returns sanitized network and relay errors without response secrets', async () => {
    const secret = '210f1718-secret-channel-token';
    const networkAuthority = createFarcasterSessionAuthority({
      client: createClient({
        createChannel: vi.fn(async () => {
          throw new TypeError(`fetch failed with ${secret}`);
        })
      }),
      now: () => NOW,
      randomSource: randomSource()
    });

    const networkError = await networkAuthority.beginSignIn(CONTEXT).catch((error: unknown) => error);
    expect(networkError).toMatchObject({
      code: 'network',
      message: 'The Farcaster relay could not be reached.'
    });
    expect(String(networkError)).not.toContain(secret);
    expect(toFarcasterAuthError(networkError)).toEqual({
      code: 'network',
      message: 'The Farcaster relay could not be reached.'
    });

    const wrappedNetworkAuthority = createFarcasterSessionAuthority({
      client: createClient({
        createChannel: vi.fn(async () => ({
          isError: true,
          error: {
            errCode: 'unknown',
            cause: new TypeError(`fetch failed with ${secret}`),
            message: secret
          }
        }))
      }),
      now: () => NOW,
      randomSource: randomSource()
    });
    const wrappedError = await wrappedNetworkAuthority.beginSignIn(CONTEXT)
      .catch((error: unknown) => error);
    expect(wrappedError).toMatchObject({
      code: 'network',
      message: 'The Farcaster relay could not be reached.'
    });
    expect(String(wrappedError)).not.toContain(secret);

    const relayAuthority = createFarcasterSessionAuthority({
      client: createClient({
        createChannel: vi.fn(async () => ({
          isError: true,
          error: { errCode: 'bad_request', message: secret }
        }))
      }),
      now: () => NOW,
      randomSource: randomSource()
    });
    await expect(relayAuthority.beginSignIn(CONTEXT)).rejects.toMatchObject({
      code: 'relay',
      message: 'The Farcaster relay could not create a sign-in request.'
    });
  });
});

describe('Farcaster channel status', () => {
  it('returns a minimal pending status and never returns the channel token', async () => {
    const client = createClient();
    const authority = createFarcasterSessionAuthority({ client });

    const status = await authority.getStatus(CHANNEL_TOKEN);

    expect(vi.mocked(client.status)).toHaveBeenCalledWith({ channelToken: CHANNEL_TOKEN });
    expect(status).toEqual({ state: 'pending', nonce: NONCE });
    expect(status).not.toHaveProperty('channelToken');
  });

  it('rejects an unexpected relay state instead of treating it as progress', async () => {
    const client = createClient({
      status: vi.fn(async () => success({ state: 'approved', nonce: NONCE }))
    });
    const authority = createFarcasterSessionAuthority({ client });

    await expect(authority.getStatus(CHANNEL_TOKEN)).rejects.toMatchObject({
      code: 'invalid-response'
    });
  });

  it('requires proof for completed status and sanitizes display metadata', async () => {
    const client = createClient({
      status: vi.fn(async () => success({
        ...completedStatus(),
        pfpUrl: 'javascript:alert(1)',
        verifications: [
          '0x2222222222222222222222222222222222222222',
          '0x2222222222222222222222222222222222222222',
          123
        ]
      }))
    });
    const authority = createFarcasterSessionAuthority({ client });

    const status = await authority.getStatus(CHANNEL_TOKEN);

    expect(status).toMatchObject({
      state: 'completed',
      nonce: NONCE,
      message: completedStatus().message,
      signature: SIGNATURE,
      fid: 12_345,
      signatureParams: completedStatus().signatureParams,
      acceptAuthAddress: true,
      username: 'warpkeeper',
      displayName: 'Warp Keeper',
      custody: '0x1111111111111111111111111111111111111111',
      verifications: ['0x2222222222222222222222222222222222222222'],
      authMethod: 'authAddress'
    });
    expect(status).not.toHaveProperty('pfpUrl');
    if (status.state === 'completed') {
      expect(Object.isFrozen(status.verifications)).toBe(true);
    }
  });

  it('accepts a bounded variable-length smart-account signature', async () => {
    const signature = `0x${'ab'.repeat(96)}` as const;
    const client = createClient({
      status: vi.fn(async () => success({
        ...completedStatus(),
        signature
      }))
    });
    const authority = createFarcasterSessionAuthority({ client });

    await expect(authority.getStatus(CHANNEL_TOKEN)).resolves.toMatchObject({
      state: 'completed',
      signature
    });
  });

  it.each([
    ['nonce', undefined],
    ['message', undefined],
    ['signature', undefined],
    ['fid', undefined],
    ['fid', 0],
    ['signature', 'not-a-signature'],
    ['signature', '0x'],
    ['signature', '0xabc'],
    ['signature', `0x${'ab'.repeat(4 * 1_024 + 1)}`],
    ['message', 'x'.repeat(8 * 1_024 + 1)],
    ['signatureParams', undefined],
    ['acceptAuthAddress', false]
  ])('rejects a completed response with invalid %s', async (field, value) => {
    const client = createClient({
      status: vi.fn(async () => success({
        ...completedStatus(),
        [field]: value
      }))
    });
    const authority = createFarcasterSessionAuthority({ client });

    await expect(authority.getStatus(CHANNEL_TOKEN)).rejects.toMatchObject({
      code: 'invalid-response'
    });
  });
});

describe('completed Farcaster proof verification', () => {
  it('verifies nonce/domain/signature with auth addresses and returns only session identity', async () => {
    const client = createClient();
    const authority = createFarcasterSessionAuthority({ client, now: () => NOW });
    const completed = completedStatus();

    const identity = await authority.verifyCompletedRequest(expectedRequest(), completed);

    expect(vi.mocked(client.verifySignInMessage)).toHaveBeenCalledWith({
      nonce: NONCE,
      domain: CONTEXT.domain,
      message: completed.message,
      signature: SIGNATURE,
      acceptAuthAddress: true
    });
    expect(identity).toEqual({
      fid: 12_345,
      username: 'warpkeeper',
      displayName: 'Warp Keeper',
      pfpUrl: 'https://images.example/keeper.png',
      custody: '0x1111111111111111111111111111111111111111',
      verifications: ['0x2222222222222222222222222222222222222222'],
      authMethod: 'authAddress',
      verifiedAt: NOW
    });
    expect(identity).not.toHaveProperty('message');
    expect(identity).not.toHaveProperty('signature');
    expect(identity).not.toHaveProperty('nonce');
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(identity.verifications)).toBe(true);
  });

  it('rejects expired and nonce-mismatched requests before calling verification', async () => {
    const client = createClient();
    const authority = createFarcasterSessionAuthority({ client, now: () => NOW });

    await expect(authority.verifyCompletedRequest(
      expectedRequest({ createdAt: NOW - 1_000, expiresAt: NOW }),
      completedStatus()
    )).rejects.toMatchObject({ code: 'expired' });
    await expect(authority.verifyCompletedRequest(
      expectedRequest(),
      completedStatus({ nonce: 'cd'.repeat(24) })
    )).rejects.toMatchObject({ code: 'verification' });
    expect(client.verifySignInMessage).not.toHaveBeenCalled();
  });

  it('binds completed relay parameters to the private channel before verification', async () => {
    const client = createClient();
    const authority = createFarcasterSessionAuthority({ client, now: () => NOW });
    const mismatched = completedStatus({
      signatureParams: {
        ...completedStatus().signatureParams,
        requestId: 'another-request'
      }
    });

    await expect(authority.verifyCompletedRequest(
      expectedRequest(),
      mismatched
    )).rejects.toMatchObject({ code: 'verification' });
    expect(client.verifySignInMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['domain', 'attacker.example'],
    ['nonce', 'cd'.repeat(24)],
    ['uri', 'https://attacker.example/'],
    ['requestId', 'another-request'],
    ['expirationTime', new Date(NOW + FARCASTER_AUTH_REQUEST_TTL_MS + 1)],
    ['chainId', 1],
    ['resources', ['farcaster://fid/54321']]
  ])('rejects a verified SIWE message with mismatched %s', async (field, value) => {
    const client = createClient({
      verifySignInMessage: vi.fn(async () => verificationResult({}, { [field]: value }))
    });
    const authority = createFarcasterSessionAuthority({ client, now: () => NOW });

    await expect(authority.verifyCompletedRequest(
      expectedRequest(),
      completedStatus()
    )).rejects.toMatchObject({ code: 'verification' });
  });

  it('rechecks expiration after asynchronous signature verification', async () => {
    const client = createClient();
    const times = [NOW, NOW + FARCASTER_AUTH_REQUEST_TTL_MS];
    const authority = createFarcasterSessionAuthority({
      client,
      now: () => times.shift() ?? NOW + FARCASTER_AUTH_REQUEST_TTL_MS
    });

    await expect(authority.verifyCompletedRequest(
      expectedRequest(),
      completedStatus()
    )).rejects.toMatchObject({ code: 'expired' });
    expect(client.verifySignInMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects failed verification and a verified FID mismatch', async () => {
    const failedClient = createClient({
      verifySignInMessage: vi.fn(async () => verificationResult({ success: false }))
    });
    const failedAuthority = createFarcasterSessionAuthority({
      client: failedClient,
      now: () => NOW
    });
    await expect(failedAuthority.verifyCompletedRequest(
      expectedRequest(),
      completedStatus()
    )).rejects.toMatchObject({ code: 'verification' });

    const mismatchClient = createClient({
      verifySignInMessage: vi.fn(async () => verificationResult({ fid: 54_321 }))
    });
    const mismatchAuthority = createFarcasterSessionAuthority({
      client: mismatchClient,
      now: () => NOW
    });
    await expect(mismatchAuthority.verifyCompletedRequest(
      expectedRequest(),
      completedStatus()
    )).rejects.toMatchObject({ code: 'fid-mismatch' });
  });

  it('exposes only stable sanitized error objects to the controller', () => {
    expect(toFarcasterAuthError(new Error('signature 0xsecret'))).toEqual({
      code: 'unknown',
      message: 'Farcaster authentication could not be completed.'
    });
    const error = new FarcasterAuthClientError('verification', 'Safe message.');
    expect(toFarcasterAuthError(error)).toEqual({
      code: 'verification',
      message: 'Safe message.'
    });
  });
});
