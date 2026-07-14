/**
 * Browser-safe configuration only. The bridge signing key, admin secret and
 * SpacetimeDB login credentials must never be exposed through Vite.
 */
export const DEFAULT_SPACETIMEDB_URI = 'https://maincloud.spacetimedb.com';
export const DEFAULT_SPACETIMEDB_DATABASE = 'warpkeep-89e4u';
export const DEFAULT_WARPKEEP_OIDC_AUDIENCE = 'warpkeep-spacetimedb';
export const CANONICAL_WARPKEEP_AUTH_ORIGIN = 'https://auth.warpkeep.com';
export const WARPKEEP_SHARED_ALPHA_UNAVAILABLE_MESSAGE =
  'FARCASTER SIGN-IN TEMPORARILY PAUSED FOR SECURITY HARDENING';

export type WarpkeepRuntimeEnvironment = Readonly<{
  DEV?: boolean;
  VITE_SPACETIMEDB_URI?: string;
  VITE_SPACETIMEDB_DATABASE?: string;
  VITE_WARPKEEP_AUTH_BRIDGE_URL?: string;
  VITE_WARPKEEP_OIDC_ISSUER?: string;
  VITE_WARPKEEP_OIDC_AUDIENCE?: string;
  VITE_WARPKEEP_SHARED_ALPHA_ENABLED?: string;
}>;

export type WarpkeepRuntimeConfig = Readonly<{
  spacetimeUri: string;
  spacetimeDatabase: string;
  audience: string;
  /** False when an explicitly supplied public coordinate failed validation. */
  publicConfigValid: boolean;
  /** Explicit public kill switch. Shared alpha remains off unless this is true. */
  sharedAlphaEnabled: boolean;
  /** A public HTTPS bridge base. Undefined means shared-alpha activation is off. */
  bridgeUrl?: string;
  /** Exact OIDC issuer that the bridge and SpacetimeDB module must agree on. */
  issuer?: string;
  /** Internal build-time guard for an explicitly configured local Worker. */
  allowLocalHttp?: boolean;
}>;

function cleanOptionalString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isLocalDevelopmentHost(hostname: string) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]';
}

/** HTTPS in production, with a deliberately narrow localhost-only HTTP escape hatch. */
function normalizeTrustedUrl(value: string | undefined, allowLocalHttp: boolean) {
  const candidate = cleanOptionalString(value);
  if (!candidate) {
    return undefined;
  }

  try {
    const parsed = new URL(candidate);
    const localHttp = allowLocalHttp
      && parsed.protocol === 'http:'
      && isLocalDevelopmentHost(parsed.hostname);
    if (
      (parsed.protocol !== 'https:' && !localHttp)
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
    ) {
      return undefined;
    }
    return parsed.pathname === '/' ? parsed.origin : parsed.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function normalizeTrustedOrigin(value: string | undefined, allowLocalHttp: boolean) {
  const candidate = cleanOptionalString(value);
  if (!candidate) return undefined;
  const trustedUrl = normalizeTrustedUrl(value, allowLocalHttp);
  if (!trustedUrl) return undefined;
  const parsed = new URL(trustedUrl);
  return parsed.pathname === '/'
    && (candidate === parsed.origin || candidate === `${parsed.origin}/`)
    ? parsed.origin
    : undefined;
}

function normalizeDatabaseName(value: string | undefined) {
  if (value === undefined) return DEFAULT_SPACETIMEDB_DATABASE;
  const candidate = cleanOptionalString(value);
  if (!candidate) return undefined;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate) ? candidate : undefined;
}

function normalizeAudience(value: string | undefined) {
  if (value === undefined) return DEFAULT_WARPKEEP_OIDC_AUDIENCE;
  const candidate = cleanOptionalString(value);
  if (!candidate) return undefined;
  return /^[A-Za-z0-9._:-]{3,160}$/.test(candidate) ? candidate : undefined;
}

function readSharedAlphaEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true';
}

/**
 * Does not throw for malformed public configuration. A malformed bridge
 * configuration must leave title/menu usable and disable all shared-state I/O.
 */
export function readWarpkeepRuntimeConfig(
  environment: WarpkeepRuntimeEnvironment = import.meta.env as WarpkeepRuntimeEnvironment
): WarpkeepRuntimeConfig {
  const allowLocalHttp = environment.DEV === true;
  const configuredSpacetimeUri = normalizeTrustedUrl(
    environment.VITE_SPACETIMEDB_URI,
    allowLocalHttp
  );
  const bridgeUrl = normalizeTrustedOrigin(
    environment.VITE_WARPKEEP_AUTH_BRIDGE_URL,
    allowLocalHttp
  );
  const issuer = normalizeTrustedOrigin(environment.VITE_WARPKEEP_OIDC_ISSUER, allowLocalHttp);
  const spacetimeDatabase = normalizeDatabaseName(environment.VITE_SPACETIMEDB_DATABASE);
  const audience = normalizeAudience(environment.VITE_WARPKEEP_OIDC_AUDIENCE);
  const publicConfigValid = (
    (environment.VITE_SPACETIMEDB_URI === undefined || configuredSpacetimeUri !== undefined)
    && spacetimeDatabase !== undefined
    && audience !== undefined
  );

  return Object.freeze({
    spacetimeUri: configuredSpacetimeUri ?? DEFAULT_SPACETIMEDB_URI,
    spacetimeDatabase: spacetimeDatabase ?? DEFAULT_SPACETIMEDB_DATABASE,
    audience: audience ?? DEFAULT_WARPKEEP_OIDC_AUDIENCE,
    publicConfigValid,
    sharedAlphaEnabled: readSharedAlphaEnabled(environment.VITE_WARPKEEP_SHARED_ALPHA_ENABLED),
    ...(bridgeUrl ? { bridgeUrl } : {}),
    ...(issuer ? { issuer } : {}),
    ...(allowLocalHttp ? { allowLocalHttp: true } : {})
  });
}

/**
 * Shared-alpha activation is intentionally opt-in. `*.invalid` is reserved
 * for the checked-in module placeholder and must never activate a browser.
 * HTTP is accepted only for an explicit localhost Worker during development.
 */
export function hasUsableWarpkeepBridge(config: WarpkeepRuntimeConfig) {
  if (
    !config.publicConfigValid
    || !config.sharedAlphaEnabled
    || !config.bridgeUrl
    || !config.issuer
  ) {
    return false;
  }

  try {
    const bridge = new URL(config.bridgeUrl);
    const issuer = new URL(config.issuer);
    const bridgeIsSafe = bridge.protocol === 'https:'
      || (config.allowLocalHttp === true
        && bridge.protocol === 'http:'
        && isLocalDevelopmentHost(bridge.hostname));
    const issuerIsSafe = issuer.protocol === 'https:'
      || (config.allowLocalHttp === true
        && issuer.protocol === 'http:'
        && isLocalDevelopmentHost(issuer.hostname));
    const localDevelopmentPair = config.allowLocalHttp === true
      && bridge.protocol === 'http:'
      && issuer.protocol === 'http:'
      && isLocalDevelopmentHost(bridge.hostname)
      && isLocalDevelopmentHost(issuer.hostname);
    const canonicalProductionPair = bridge.origin === CANONICAL_WARPKEEP_AUTH_ORIGIN
      && issuer.origin === CANONICAL_WARPKEEP_AUTH_ORIGIN
      && config.spacetimeUri === DEFAULT_SPACETIMEDB_URI
      && config.spacetimeDatabase === DEFAULT_SPACETIMEDB_DATABASE;
    return !bridge.hostname.endsWith('.invalid')
      && !issuer.hostname.endsWith('.invalid')
      && bridgeIsSafe
      && issuerIsSafe
      && bridge.username === ''
      && bridge.password === ''
      && issuer.username === ''
      && issuer.password === ''
      && bridge.pathname === '/'
      && issuer.pathname === '/'
      && bridge.search === ''
      && issuer.search === ''
      && bridge.hash === ''
      && issuer.hash === ''
      && bridge.origin === issuer.origin
      && config.audience === DEFAULT_WARPKEEP_OIDC_AUDIENCE
      && (localDevelopmentPair || canonicalProductionPair);
  } catch {
    return false;
  }
}
