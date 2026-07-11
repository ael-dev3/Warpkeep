/**
 * These values are deliberately compiled into the module. SpacetimeDB modules
 * run in a deterministic sandbox and cannot safely consult browser or host
 * environment variables at request time.
 *
 * The placeholder is fail-closed: no practical production bridge token can
 * satisfy this issuer. Replace it with the exact public HTTPS issuer only when
 * the bridge discovery document and JWKS are deployed and independently
 * reachable by Maincloud, then build and publish non-destructively.
 */
export const WARPKEEP_OIDC_ISSUER = 'https://auth.warpkeep.invalid';
export const WARPKEEP_OIDC_AUDIENCE = 'warpkeep-spacetimedb';
export const WARPKEEP_TOKEN_TYPE = 'spacetime-access';
export const WARPKEEP_ADMIN_ROLE = 'warpkeep-admin';
export const WARPKEEP_HERMES_SUBJECT = 'service:hermes';

export const MAX_SUPPORTED_FID = BigInt(Number.MAX_SAFE_INTEGER);
export const MAX_AUTH_EPOCH = 0xffff_ffff;

export const WARPKEEP_JWT_CONFIG = Object.freeze({
  issuer: WARPKEEP_OIDC_ISSUER,
  audience: WARPKEEP_OIDC_AUDIENCE,
  tokenType: WARPKEEP_TOKEN_TYPE,
});

export function isPlaceholderIssuer(issuer = WARPKEEP_OIDC_ISSUER): boolean {
  return issuer === 'https://auth.warpkeep.invalid';
}
