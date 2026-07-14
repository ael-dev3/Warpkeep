import {
  FARCASTER_AUTH_REQUEST_TTL_MS,
  createFarcasterRequestMaterial,
  getBrowserFarcasterAuthContext,
  type FarcasterSecureRandomSource
} from './farcasterAuthContext';
import { FarcasterOidcBridgeClientError } from './farcasterOidcBridgeClient';
import { safePublicHttpsImageUrl } from '../security/publicImageUrl';
import {
  isBoundedFarcasterSignature,
  type FarcasterAuthContext,
  type FarcasterAuthError,
  type FarcasterAuthErrorCode,
  type FarcasterAuthMethod,
  type FarcasterBridgeChallenge,
  type FarcasterChannelStatus,
  type FarcasterCompletedChannelStatus,
  type FarcasterExpectedSignInRequest,
  type FarcasterHex,
  type FarcasterSessionAuthority,
  type FarcasterSignInChannel,
  type VerifiedFarcasterIdentity
} from './farcasterAuthTypes';

export const FARCASTER_AUTH_RELAY_URL = 'https://relay.farcaster.xyz';
export const FARCASTER_OPTIMISM_RPC_URL = 'https://mainnet.optimism.io';

const MAX_CHANNEL_URL_LENGTH = 8_192;
const MAX_PROOF_MESSAGE_LENGTH = 8 * 1_024;
const MAX_PROFILE_FIELD_LENGTH = 256;
const MAX_PROFILE_URL_LENGTH = 2_048;
const MAX_VERIFICATIONS = 100;

type CreateChannelArguments = Readonly<{
  siweUri: string;
  domain: string;
  nonce: string;
  expirationTime: string;
  requestId: string;
  acceptAuthAddress: true;
}>;

type StatusArguments = Readonly<{
  channelToken: string;
}>;

type VerifyArguments = Readonly<{
  nonce: string;
  domain: string;
  message: string;
  signature: FarcasterHex;
  acceptAuthAddress: true;
}>;

/** Minimal port implemented by the official AppClient and simple test fakes. */
export interface FarcasterAppClientPort {
  createChannel(args: CreateChannelArguments): Promise<unknown>;
  status(args: StatusArguments): Promise<unknown>;
  verifySignInMessage(args: VerifyArguments): Promise<unknown>;
}

export type FarcasterAppClientLoader = () => Promise<FarcasterAppClientPort>;

export type CreateFarcasterSessionAuthorityOptions = Readonly<{
  client?: FarcasterAppClientPort;
  loadClient?: FarcasterAppClientLoader;
  now?: () => number;
  randomSource?: FarcasterSecureRandomSource;
  resolveContext?: () => FarcasterAuthContext;
}>;

type ClientOperation = 'create-channel' | 'status' | 'verify';

export class FarcasterAuthClientError extends Error {
  override readonly name = 'FarcasterAuthClientError';

  constructor(
    readonly code: FarcasterAuthErrorCode,
    message: string
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositiveFid(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNonce(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{8,128}$/.test(value);
}

function isChannelToken(value: unknown): value is string {
  return typeof value === 'string'
    && /^[A-Za-z0-9._~-]{8,512}$/.test(value);
}

function isHex(value: unknown): value is FarcasterHex {
  return isBoundedFarcasterSignature(value);
}

function isAddress(value: unknown): value is FarcasterHex {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isAuthMethod(value: unknown): value is FarcasterAuthMethod {
  return value === 'custody' || value === 'authAddress';
}

function invalidResponse(message = 'The Farcaster relay returned an invalid response.'): never {
  throw new FarcasterAuthClientError('invalid-response', message);
}

function safeErrorMessage(operation: ClientOperation, code: FarcasterAuthErrorCode) {
  if (code === 'network') {
    return operation === 'verify'
      ? 'The Farcaster signature service could not be reached.'
      : 'The Farcaster relay could not be reached.';
  }
  if (operation === 'verify') {
    return 'The Farcaster signature could not be verified.';
  }
  if (operation === 'status') {
    return 'The Farcaster relay could not check this sign-in request.';
  }
  return 'The Farcaster relay could not create a sign-in request.';
}

function normalizeClientError(error: unknown, operation: ClientOperation): FarcasterAuthClientError {
  if (error instanceof FarcasterAuthClientError) {
    return error;
  }

  const errCode = isRecord(error) && typeof error.errCode === 'string'
    ? error.errCode
    : undefined;
  const cause = isRecord(error) ? error.cause : undefined;
  const networkFailure = error instanceof TypeError
    || cause instanceof TypeError
    || errCode === 'unavailable';
  const code: FarcasterAuthErrorCode = networkFailure
    ? 'network'
    : operation === 'verify'
      ? 'verification'
      : 'relay';
  return new FarcasterAuthClientError(code, safeErrorMessage(operation, code));
}

export function toFarcasterAuthError(error: unknown): FarcasterAuthError {
  if (error instanceof FarcasterAuthClientError) {
    return Object.freeze({ code: error.code, message: error.message });
  }
  if (error instanceof FarcasterOidcBridgeClientError) {
    return Object.freeze({
      code: 'bridge',
      message: 'The Hegemony verification service could not confirm this sign-in.'
    });
  }
  return Object.freeze({
    code: 'unknown',
    message: 'Farcaster authentication could not be completed.'
  });
}

function requestFromBridgeChallenge(
  challenge: FarcasterBridgeChallenge | undefined,
  now: number
) {
  if (!challenge) {
    return undefined;
  }
  if (
    typeof challenge.nonce !== 'string'
    || !isNonce(challenge.nonce)
    || typeof challenge.requestId !== 'string'
    || !/^[A-Za-z0-9._~-]{8,256}$/.test(challenge.requestId)
    || !Number.isSafeInteger(challenge.createdAt)
    || !Number.isSafeInteger(challenge.expiresAt)
    || challenge.createdAt < 0
    || challenge.createdAt > now + 60_000
    || challenge.expiresAt <= now
    || challenge.expiresAt <= challenge.createdAt
    || challenge.expiresAt - challenge.createdAt > FARCASTER_AUTH_REQUEST_TTL_MS
    || challenge.expiresAt > 8.64e15
  ) {
    return invalidResponse('Warpkeep could not validate its Farcaster bridge challenge.');
  }

  return Object.freeze({
    nonce: challenge.nonce,
    requestId: challenge.requestId,
    createdAt: challenge.createdAt,
    expiresAt: challenge.expiresAt,
    expirationTime: new Date(challenge.expiresAt).toISOString()
  });
}

async function callClient<T>(
  operation: ClientOperation,
  call: () => Promise<T>
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw normalizeClientError(error, operation);
  }
}

function unwrapClientData(result: unknown, operation: ClientOperation) {
  if (!isRecord(result)) {
    return invalidResponse('The Farcaster client returned an invalid response envelope.');
  }
  if (typeof result.isError !== 'boolean') {
    return invalidResponse('The Farcaster client response omitted its error state.');
  }
  if (result.isError) {
    throw normalizeClientError(result.error, operation);
  }
  if (
    !isRecord(result.response)
    || typeof result.response.ok !== 'boolean'
    || typeof result.response.status !== 'number'
  ) {
    return invalidResponse('The Farcaster client response omitted its HTTP status.');
  }
  if (!result.response.ok) {
    throw new FarcasterAuthClientError(
      'relay',
      safeErrorMessage(operation, 'relay')
    );
  }
  if (!isRecord(result.data)) {
    return invalidResponse('The Farcaster client response omitted its response data.');
  }
  return result.data;
}

function unwrapVerification(result: unknown) {
  if (!isRecord(result) || typeof result.isError !== 'boolean') {
    return invalidResponse('The Farcaster verification result was incomplete.');
  }
  if (result.isError) {
    throw normalizeClientError(result.error, 'verify');
  }
  return result;
}

function validateAuthContext(context: FarcasterAuthContext) {
  if (
    typeof context.domain !== 'string'
    || context.domain === ''
    || /[\s/?#]/.test(context.domain)
    || typeof context.siweUri !== 'string'
  ) {
    return invalidResponse('Warpkeep could not validate its Farcaster sign-in context.');
  }

  let siweUri: URL;
  try {
    siweUri = new URL(context.siweUri);
  } catch {
    return invalidResponse('Warpkeep could not validate its Farcaster sign-in context.');
  }
  if (
    (siweUri.protocol !== 'https:' && siweUri.protocol !== 'http:')
    || siweUri.host !== context.domain
    || siweUri.username !== ''
    || siweUri.password !== ''
    || siweUri.search !== ''
    || siweUri.hash !== ''
  ) {
    return invalidResponse('Warpkeep could not validate its Farcaster sign-in context.');
  }
}

function requireSingleUrlParameter(url: URL, name: string) {
  const values = url.searchParams.getAll(name);
  if (values.length !== 1 || values[0] === '') {
    return invalidResponse('The Farcaster relay returned an invalid sign-in URL.');
  }
  return values[0];
}

function validateChannelUrl(
  value: unknown,
  channelToken: string,
  nonce: string,
  context: FarcasterAuthContext
): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_CHANNEL_URL_LENGTH) {
    return invalidResponse('The Farcaster relay returned an invalid sign-in URL.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidResponse('The Farcaster relay returned an invalid sign-in URL.');
  }

  if (
    url.username !== ''
    || url.password !== ''
    || url.port !== ''
    || url.hash !== ''
    || requireSingleUrlParameter(url, 'channelToken') !== channelToken
  ) {
    return invalidResponse('The Farcaster relay returned an invalid sign-in URL.');
  }

  const queryNames = [...new Set(url.searchParams.keys())].sort();
  const isCurrentWebUrl = url.protocol === 'https:'
    && url.hostname === 'farcaster.xyz'
    && url.pathname === '/~/siwf'
    && queryNames.length === 1
    && queryNames[0] === 'channelToken';
  const isLegacyDeepLink = url.protocol === 'farcaster:'
    && url.hostname === 'connect'
    && (url.pathname === '' || url.pathname === '/')
    && queryNames.length === 4
    && queryNames.join(',') === 'channelToken,domain,nonce,siweUri'
    && requireSingleUrlParameter(url, 'nonce') === nonce
    && requireSingleUrlParameter(url, 'domain') === context.domain
    && requireSingleUrlParameter(url, 'siweUri') === context.siweUri;

  if (!isCurrentWebUrl && !isLegacyDeepLink) {
    return invalidResponse('The Farcaster relay returned an invalid sign-in URL.');
  }

  return value;
}

function optionalProfileString(
  data: Record<string, unknown>,
  key: string
): string | undefined {
  const value = data[key];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string' || value.length > MAX_PROFILE_FIELD_LENGTH) {
    return invalidResponse();
  }
  const normalized = value.trim();
  return normalized === '' ? undefined : normalized;
}

function optionalProfileUrl(data: Record<string, unknown>) {
  const value = data.pfpUrl;
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string' || value.length > MAX_PROFILE_URL_LENGTH) {
    return undefined;
  }
  return safePublicHttpsImageUrl(value);
}

function optionalCustody(data: Record<string, unknown>) {
  return isAddress(data.custody) ? data.custody : undefined;
}

function readVerifications(data: Record<string, unknown>): readonly string[] {
  if (data.verifications === undefined || data.verifications === null) {
    return Object.freeze([]);
  }
  if (!Array.isArray(data.verifications)) {
    return invalidResponse();
  }

  const unique = new Set<string>();
  for (const value of data.verifications.slice(0, MAX_VERIFICATIONS)) {
    if (typeof value === 'string' && value.length <= MAX_PROFILE_FIELD_LENGTH) {
      unique.add(value);
    }
  }
  return Object.freeze([...unique]);
}

function readSignatureParams(data: Record<string, unknown>) {
  const params = data.signatureParams;
  if (
    !isRecord(params)
    || typeof params.siweUri !== 'string'
    || params.siweUri === ''
    || typeof params.domain !== 'string'
    || params.domain === ''
    || !isNonce(params.nonce)
    || typeof params.expirationTime !== 'string'
    || !Number.isFinite(Date.parse(params.expirationTime))
    || typeof params.requestId !== 'string'
    || params.requestId === ''
  ) {
    return invalidResponse(
      'The completed Farcaster request did not match its signed request parameters.'
    );
  }
  return Object.freeze({
    siweUri: params.siweUri,
    domain: params.domain,
    nonce: params.nonce,
    expirationTime: params.expirationTime,
    requestId: params.requestId
  });
}

function readCompletedStatus(data: Record<string, unknown>): FarcasterCompletedChannelStatus {
  if (
    !isNonce(data.nonce)
    || typeof data.message !== 'string'
    || data.message.length === 0
    || data.message.length > MAX_PROOF_MESSAGE_LENGTH
    || !isHex(data.signature)
    || !isPositiveFid(data.fid)
    || data.acceptAuthAddress !== true
  ) {
    return invalidResponse(
      'The completed Farcaster request did not contain valid signature proof.'
    );
  }

  const authMethod = data.authMethod === undefined
    ? undefined
    : isAuthMethod(data.authMethod)
      ? data.authMethod
      : invalidResponse();
  const username = optionalProfileString(data, 'username');
  const displayName = optionalProfileString(data, 'displayName');
  const pfpUrl = optionalProfileUrl(data);
  const custody = optionalCustody(data);

  return Object.freeze({
    state: 'completed',
    nonce: data.nonce,
    message: data.message,
    signature: data.signature,
    fid: data.fid,
    signatureParams: readSignatureParams(data),
    acceptAuthAddress: true,
    ...(username ? { username } : {}),
    ...(displayName ? { displayName } : {}),
    ...(pfpUrl ? { pfpUrl } : {}),
    ...(custody ? { custody } : {}),
    verifications: readVerifications(data),
    ...(authMethod ? { authMethod } : {})
  });
}

function validateExpectedRequest(
  expected: FarcasterExpectedSignInRequest,
  completed: FarcasterCompletedChannelStatus,
  now: number
) {
  if (
    !isNonce(expected.nonce)
    || typeof expected.requestId !== 'string'
    || expected.requestId === ''
    || typeof expected.siweUri !== 'string'
    || !Number.isFinite(expected.createdAt)
    || !Number.isFinite(expected.expiresAt)
    || expected.expiresAt <= expected.createdAt
    || !Number.isFinite(now)
  ) {
    return invalidResponse('Warpkeep could not validate this sign-in request.');
  }
  validateAuthContext({ domain: expected.domain, siweUri: expected.siweUri });
  if (now >= expected.expiresAt) {
    throw new FarcasterAuthClientError(
      'expired',
      'The Farcaster sign-in request has expired.'
    );
  }
  const signatureParams = completed.signatureParams;
  if (
    signatureParams.nonce !== expected.nonce
    || signatureParams.domain !== expected.domain
    || signatureParams.siweUri !== expected.siweUri
    || signatureParams.requestId !== expected.requestId
    || Date.parse(signatureParams.expirationTime) !== expected.expiresAt
    || completed.acceptAuthAddress !== true
  ) {
    throw new FarcasterAuthClientError(
      'verification',
      'The completed Farcaster request did not match this sign-in attempt.'
    );
  }
  if (completed.nonce !== expected.nonce) {
    throw new FarcasterAuthClientError(
      'verification',
      'The completed Farcaster request did not match this sign-in attempt.'
    );
  }
}

function readDateTime(value: unknown) {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string') {
    return Date.parse(value);
  }
  return Number.NaN;
}

function validateVerifiedSiweMessage(
  value: unknown,
  expected: FarcasterExpectedSignInRequest,
  verifiedFid: number
) {
  if (!isRecord(value)) {
    return invalidResponse('The Farcaster verification result was incomplete.');
  }
  if (
    value.domain !== expected.domain
    || value.nonce !== expected.nonce
    || value.uri !== expected.siweUri
    || value.requestId !== expected.requestId
    || readDateTime(value.expirationTime) !== expected.expiresAt
    || value.chainId !== 10
    || value.version !== '1'
    || !Array.isArray(value.resources)
    || !value.resources.includes(`farcaster://fid/${verifiedFid}`)
  ) {
    throw new FarcasterAuthClientError(
      'verification',
      'The verified Farcaster message did not match this sign-in attempt.'
    );
  }
}

let officialAppClientPromise: Promise<FarcasterAppClientPort> | undefined;

/** Dynamically loads and retains one successful official client. */
export function getDefaultFarcasterAppClient(): Promise<FarcasterAppClientPort> {
  if (!officialAppClientPromise) {
    const clientPromise = import('@farcaster/auth-client').then((module) => (
      module.createAppClient({
        relay: FARCASTER_AUTH_RELAY_URL,
        ethereum: module.viemConnector({ rpcUrl: FARCASTER_OPTIMISM_RPC_URL })
      })
    ));
    officialAppClientPromise = clientPromise;
    void clientPromise.catch(() => {
      if (officialAppClientPromise === clientPromise) {
        officialAppClientPromise = undefined;
      }
    });
  }
  return officialAppClientPromise;
}

export function createFarcasterSessionAuthority(
  options: CreateFarcasterSessionAuthorityOptions = {}
): FarcasterSessionAuthority {
  if (options.client && options.loadClient) {
    throw new FarcasterAuthClientError(
      'unknown',
      'Warpkeep received conflicting Farcaster client configuration.'
    );
  }

  const now = options.now ?? Date.now;
  const resolveContext = options.resolveContext ?? getBrowserFarcasterAuthContext;
  const loadClient = options.client
    ? async () => options.client as FarcasterAppClientPort
    : options.loadClient ?? getDefaultFarcasterAppClient;
  let clientPromise: Promise<FarcasterAppClientPort> | undefined;
  const client = () => {
    if (!clientPromise) {
      const pendingClient = Promise.resolve().then(loadClient);
      clientPromise = pendingClient;
      void pendingClient.catch(() => {
        if (clientPromise === pendingClient) {
          clientPromise = undefined;
        }
      });
    }
    return clientPromise;
  };

  return Object.freeze({
    async beginSignIn(
      context = resolveContext(),
      bridgeChallenge: FarcasterBridgeChallenge | undefined = undefined
    ) {
      validateAuthContext(context);
      const requestNow = Math.floor(now());
      const request = requestFromBridgeChallenge(bridgeChallenge, requestNow)
        ?? createFarcasterRequestMaterial(requestNow, options.randomSource);
      const appClient = await callClient('create-channel', client);
      const response = await callClient(
        'create-channel',
        () => appClient.createChannel({
          siweUri: context.siweUri,
          domain: context.domain,
          requestId: request.requestId,
          nonce: request.nonce,
          expirationTime: request.expirationTime,
          acceptAuthAddress: true
        })
      );
      const data = unwrapClientData(response, 'create-channel');
      if (!isChannelToken(data.channelToken)) {
        return invalidResponse(
          'The Farcaster relay returned an invalid channel identifier.'
        );
      }
      if (data.nonce !== request.nonce) {
        return invalidResponse(
          'The Farcaster relay did not preserve the requested sign-in nonce.'
        );
      }
      const url = validateChannelUrl(
        data.url,
        data.channelToken,
        request.nonce,
        context
      );

      return Object.freeze({
        channelToken: data.channelToken,
        url,
        nonce: request.nonce,
        requestId: request.requestId,
        domain: context.domain,
        siweUri: context.siweUri,
        createdAt: request.createdAt,
        expiresAt: request.expiresAt
      } satisfies FarcasterSignInChannel);
    },

    async getStatus(channelToken: string): Promise<FarcasterChannelStatus> {
      if (!isChannelToken(channelToken)) {
        return invalidResponse('Warpkeep could not check this sign-in request.');
      }
      const appClient = await callClient('status', client);
      const response = await callClient(
        'status',
        () => appClient.status({ channelToken })
      );
      const data = unwrapClientData(response, 'status');
      if (data.state === 'pending') {
        if (!isNonce(data.nonce)) {
          return invalidResponse();
        }
        return Object.freeze({ state: 'pending', nonce: data.nonce });
      }
      if (data.state === 'completed') {
        return readCompletedStatus(data);
      }
      return invalidResponse();
    },

    async verifyCompletedRequest(
      expected: FarcasterExpectedSignInRequest,
      completed: FarcasterCompletedChannelStatus
    ): Promise<VerifiedFarcasterIdentity> {
      const verificationStartedAt = Math.floor(now());
      validateExpectedRequest(expected, completed, verificationStartedAt);
      const appClient = await callClient('verify', client);
      const response = await callClient(
        'verify',
        () => appClient.verifySignInMessage({
          nonce: expected.nonce,
          domain: expected.domain,
          message: completed.message,
          signature: completed.signature,
          acceptAuthAddress: true
        })
      );
      const data = unwrapVerification(response);
      if (data.success !== true || !isPositiveFid(data.fid)) {
        throw new FarcasterAuthClientError(
          'verification',
          'The Farcaster signature could not be verified.'
        );
      }
      if (data.fid !== completed.fid) {
        throw new FarcasterAuthClientError(
          'fid-mismatch',
          'The verified FID did not match the Farcaster relay response.'
        );
      }
      if (!isAuthMethod(data.authMethod)) {
        return invalidResponse('The Farcaster verification result was incomplete.');
      }
      if (completed.authMethod && completed.authMethod !== data.authMethod) {
        throw new FarcasterAuthClientError(
          'verification',
          'The verified Farcaster authentication method did not match the relay response.'
        );
      }
      validateVerifiedSiweMessage(data.data, expected, data.fid);
      const verifiedAt = Math.floor(now());
      if (!Number.isFinite(verifiedAt) || verifiedAt >= expected.expiresAt) {
        throw new FarcasterAuthClientError(
          'expired',
          'The Farcaster sign-in request has expired.'
        );
      }

      return Object.freeze({
        fid: data.fid,
        ...(completed.username ? { username: completed.username } : {}),
        ...(completed.displayName ? { displayName: completed.displayName } : {}),
        ...(completed.pfpUrl ? { pfpUrl: completed.pfpUrl } : {}),
        ...(completed.custody ? { custody: completed.custody } : {}),
        verifications: Object.freeze([...completed.verifications]),
        authMethod: data.authMethod,
        verifiedAt
      });
    }
  });
}

let defaultAuthority: FarcasterSessionAuthority | undefined;

/** Stable dynamic-import entry point used by the React provider. */
export async function getDefaultFarcasterSessionAuthority(): Promise<FarcasterSessionAuthority> {
  defaultAuthority ??= createFarcasterSessionAuthority();
  return defaultAuthority;
}
