/**
 * Checked-in authority for the one production player-path canary that may
 * authorize the later presentation successor.
 *
 * `productionPlayerCanarySourceCommit` is the exact Hermes-final predecessor
 * Pages source commit, never the presentation successor commit.
 */
export const PRODUCTION_PLAYER_CANARY_RELEASE_BINDING = Object.freeze({
  productionPlayerCanaryReceiptDigest: null,
  productionPlayerCanarySourceCommit: null,
});

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const EXACT_KEYS = Object.freeze([
  'productionPlayerCanaryReceiptDigest',
  'productionPlayerCanarySourceCommit',
]);

export class ProductionPlayerCanaryReleaseBindingError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProductionPlayerCanaryReleaseBindingError';
    this.code = code;
  }
}

function fail(code) {
  throw new ProductionPlayerCanaryReleaseBindingError(code);
}

export function parseProductionPlayerCanaryReleaseBinding(
  value,
  { required = false } = {},
) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== EXACT_KEYS.join(',')
  ) fail('PRODUCTION_PLAYER_CANARY_RELEASE_BINDING_INVALID');
  const digest = value.productionPlayerCanaryReceiptDigest;
  const sourceCommit = value.productionPlayerCanarySourceCommit;
  if (digest === null && sourceCommit === null) {
    if (required) fail('PRODUCTION_PLAYER_CANARY_RELEASE_BINDING_REQUIRED');
    return PRODUCTION_PLAYER_CANARY_RELEASE_BINDING;
  }
  if (
    typeof digest !== 'string' || !SHA256.test(digest)
    || typeof sourceCommit !== 'string' || !COMMIT.test(sourceCommit)
  ) fail('PRODUCTION_PLAYER_CANARY_RELEASE_BINDING_INVALID');
  return Object.freeze({
    productionPlayerCanaryReceiptDigest: digest,
    productionPlayerCanarySourceCommit: sourceCommit,
  });
}
