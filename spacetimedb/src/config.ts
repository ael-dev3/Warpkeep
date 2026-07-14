/**
 * These values are deliberately compiled into the module. SpacetimeDB modules
 * run in a deterministic sandbox and cannot safely consult browser or host
 * environment variables at request time.
 *
 * This issuer is activated only after its public discovery document and JWKS
 * have been verified over HTTPS. Future issuer changes require the same
 * verification and a non-destructive module publish.
 */
export const WARPKEEP_OIDC_ISSUER = 'https://auth.warpkeep.com';
export const WARPKEEP_OIDC_AUDIENCE = 'warpkeep-spacetimedb';
export const WARPKEEP_TOKEN_TYPE = 'spacetime-access';
export const WARPKEEP_AUTH_VERSION = 2;
export const WARPKEEP_ADMIN_ROLE = 'warpkeep-admin';
export const WARPKEEP_HERMES_SUBJECT = 'service:hermes';
export const WARPKEEP_AUTH_EPOCH_RESOLVER_ROLE = 'warpkeep-auth-epoch-resolver';
export const WARPKEEP_AUTH_EPOCH_RESOLVER_SUBJECT = 'service:auth-epoch-resolver';
/**
 * Internal bridge-only principal for the bounded, privacy-sanitized QA realm
 * snapshot. It is neither a player nor an administrator and is never returned
 * to a browser or local QA process.
 */
export const WARPKEEP_QA_SNAPSHOT_RESOLVER_ROLE = 'warpkeep-qa-snapshot-resolver';
export const WARPKEEP_QA_SNAPSHOT_RESOLVER_SUBJECT = 'service:qa-snapshot-resolver';
/** Internal wire contract, intentionally separate from the player-facing app version. */
export const WARPKEEP_BACKEND_PROTOCOL_VERSION = 3;

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
