import type { WarpkeepRuntimeConfig } from '../spacetime/warpkeepConfig';

export const LOCAL_FULLSTACK_QA_ISSUER = 'http://127.0.0.1';
export const LOCAL_FULLSTACK_QA_DATABASE = 'warpkeep-local-fullstack';
export const LOCAL_FULLSTACK_QA_AUDIENCE = 'warpkeep-spacetimedb';
export const LOCAL_FULLSTACK_QA_PROFILE_URL =
  'https://i.imgur.com/warpkeep-local-keeper.png';

const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export type LocalFullstackQaBootstrap = Readonly<{
  version: 1;
  spacetimeUri: string;
  database: typeof LOCAL_FULLSTACK_QA_DATABASE;
  issuer: typeof LOCAL_FULLSTACK_QA_ISSUER;
  audience: typeof LOCAL_FULLSTACK_QA_AUDIENCE;
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: typeof LOCAL_FULLSTACK_QA_PROFILE_URL;
  accessToken: string;
  accessExpiresAt: number;
  sessionExpiresAt: number;
}>;

function exactRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function exactLoopbackSpacetimeUri(value: unknown) {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:'
      && parsed.hostname === '127.0.0.1'
      && parsed.port !== ''
      && parsed.username === ''
      && parsed.password === ''
      && parsed.pathname === '/'
      && parsed.search === ''
      && parsed.hash === ''
      && value === parsed.origin
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The browser accepts one in-memory bootstrap object from the runtime-owned
 * Vite plugin. No URL, storage entry, environment variable, or HTML attribute
 * can provide synthetic authority.
 */
export function readLocalFullstackQaBootstrap(
  value: unknown,
  now = Date.now()
): LocalFullstackQaBootstrap {
  const candidate = exactRecord(value);
  const keys = candidate ? Object.keys(candidate).sort() : [];
  const expectedKeys = [
    'accessExpiresAt',
    'accessToken',
    'audience',
    'database',
    'displayName',
    'fid',
    'issuer',
    'pfpUrl',
    'sessionExpiresAt',
    'spacetimeUri',
    'username',
    'version'
  ].sort();
  if (
    !candidate
    || keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
    || candidate.version !== 1
    || exactLoopbackSpacetimeUri(candidate.spacetimeUri) === undefined
    || candidate.database !== LOCAL_FULLSTACK_QA_DATABASE
    || candidate.issuer !== LOCAL_FULLSTACK_QA_ISSUER
    || candidate.audience !== LOCAL_FULLSTACK_QA_AUDIENCE
    || !Number.isSafeInteger(candidate.fid)
    || (candidate.fid as number) <= 0
    || typeof candidate.username !== 'string'
    || !/^qa\.[a-z0-9._-]{1,48}$/.test(candidate.username)
    || typeof candidate.displayName !== 'string'
    || candidate.displayName.length < 3
    || candidate.displayName.length > 80
    || candidate.pfpUrl !== LOCAL_FULLSTACK_QA_PROFILE_URL
    || typeof candidate.accessToken !== 'string'
    || candidate.accessToken.length > 16_384
    || !JWT_PATTERN.test(candidate.accessToken)
    || !Number.isSafeInteger(candidate.accessExpiresAt)
    || !Number.isSafeInteger(candidate.sessionExpiresAt)
    || !Number.isSafeInteger(now)
    || (candidate.accessExpiresAt as number) <= now
    || (candidate.accessExpiresAt as number) - now > 10 * 60 * 1_000
    || (candidate.sessionExpiresAt as number) < (candidate.accessExpiresAt as number)
  ) {
    throw new Error('Disposable full-stack QA bootstrap is invalid.');
  }
  return Object.freeze(candidate as unknown as LocalFullstackQaBootstrap);
}

export function localFullstackQaRuntimeConfig(
  bootstrap: LocalFullstackQaBootstrap
): WarpkeepRuntimeConfig {
  return Object.freeze({
    spacetimeUri: bootstrap.spacetimeUri,
    spacetimeDatabase: bootstrap.database,
    bridgeUrl: bootstrap.issuer,
    issuer: bootstrap.issuer,
    audience: bootstrap.audience,
    publicConfigValid: true,
    sharedAlphaEnabled: true,
    allowLocalHttp: true
  });
}
