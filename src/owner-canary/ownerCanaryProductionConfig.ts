import {
  CANONICAL_WARPKEEP_AUTH_ORIGIN,
  DEFAULT_SPACETIMEDB_DATABASE,
  DEFAULT_SPACETIMEDB_URI,
  DEFAULT_WARPKEEP_OIDC_AUDIENCE,
  hasUsableWarpkeepBridge,
  type WarpkeepRuntimeConfig,
} from '../spacetime/warpkeepConfig';

/** Exact public coordinates required before a production adapter may be composed. */
export function isExactOwnerCanaryProductionConfig(
  config: WarpkeepRuntimeConfig,
): boolean {
  return hasUsableWarpkeepBridge(config)
    && config.publicConfigValid === true
    && config.sharedAlphaEnabled === true
    && config.spacetimeUri === DEFAULT_SPACETIMEDB_URI
    && config.spacetimeDatabase === DEFAULT_SPACETIMEDB_DATABASE
    && config.bridgeUrl === CANONICAL_WARPKEEP_AUTH_ORIGIN
    && config.issuer === CANONICAL_WARPKEEP_AUTH_ORIGIN
    && config.audience === DEFAULT_WARPKEEP_OIDC_AUDIENCE
    && config.allowLocalHttp !== true;
}
