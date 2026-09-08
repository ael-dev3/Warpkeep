import { createHash, createPublicKey, verify } from 'node:crypto';
import { RECOVERY_KEY_ID, RECOVERY_PUBLIC_JWK, RECOVERY_KEY_THUMBPRINT } from './recovery-public-key.mjs';
const ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const HASH = /^[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{40}$/u;
const ID = /^[1-9][0-9]{0,19}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const KEYS = ['schemaVersion', 'profile', 'requestId', 'authorizationEpoch', 'repository', 'repositoryId',
  'repositoryOwnerId', 'preparationCommit', 'preparationTree', 'policyDigest', 'configuredArmingDigest',
  'runId', 'runAttempt', 'checkRunId', 'createdAt'];
const fail = () => { throw Error('SEALED_REALMS_RECOVERY_PREPARATION_RECEIPT_INVALID'); };
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) fail();
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) fail();
  return bytes;
}
/** Authenticates durable reservation data, never authorization to deploy or consume an epoch. */
export function verifySealedRealmsProductionRecoveryPreparationReceipt(compact) {
  try {
    if (arguments.length !== 1 || typeof compact !== 'string' || compact.length > 16384) fail();
    const parts = compact.split('.');
    if (parts.length !== 3) fail();
    const [header, body, signature] = parts.map(decode);
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    if (decoder.decode(header) !== JSON.stringify({ alg: 'ES256', typ: 'warpkeep-recovery-preparation-receipt+jws', kid: RECOVERY_KEY_ID })) fail();
    const raw = decoder.decode(body), payload = JSON.parse(raw), intent = payload?.intent;
    if (!intent || typeof intent !== 'object' || Array.isArray(intent)
      || Object.keys(intent).length !== KEYS.length || KEYS.some((key, i) => Object.keys(intent)[i] !== key)) fail();
    const expected = { schemaVersion: 1, profile: 'warpkeep-recovery-preparation-receipt-v1',
      iss: 'https://release-auth.warpkeep.com', aud: 'https://release-auth.warpkeep.com/preparation',
      purpose: 'activation-evidence-preparation', intent };
    if (JSON.stringify(expected) !== raw || intent.schemaVersion !== 1 || intent.profile !== 'warpkeep-recovery-preparation-intent-v1'
      || typeof intent.requestId !== 'string' || !UUID.test(intent.requestId)
      || !Number.isSafeInteger(intent.authorizationEpoch) || intent.authorizationEpoch < 1
      || intent.repository !== 'ael-dev3/Warpkeep' || intent.repositoryId !== '1273513252' || intent.repositoryOwnerId !== '183124839'
      || typeof intent.preparationCommit !== 'string' || !SHA.test(intent.preparationCommit)
      || typeof intent.preparationTree !== 'string' || !SHA.test(intent.preparationTree)
      || typeof intent.policyDigest !== 'string' || !HASH.test(intent.policyDigest)
      || (intent.configuredArmingDigest !== null && (typeof intent.configuredArmingDigest !== 'string' || !HASH.test(intent.configuredArmingDigest)))
      || ['runId', 'runAttempt', 'checkRunId'].some(key => typeof intent[key] !== 'string' || !ID.test(intent[key]))
      || !Number.isSafeInteger(intent.createdAt) || intent.createdAt < 1) fail();
    const policy = { schemaVersion: 1, profile: 'warpkeep-recovery-preparation-policy-v1', enabled: true,
      authorizationEpoch: intent.authorizationEpoch,
      workflowRef: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main',
      environment: 'notification-bridge-prepared', operation: 'activation-evidence-generate' };
    if (createHash('sha256').update(`warpkeep-recovery-preparation-data-v1\n${JSON.stringify(policy)}`).digest('hex') !== intent.policyDigest) fail();
    if (signature.length !== 64) fail();
    const r = BigInt(`0x${signature.subarray(0, 32).toString('hex')}`), s = BigInt(`0x${signature.subarray(32).toString('hex')}`);
    if (r < 1n || r >= ORDER || s < 1n || s > ORDER / 2n) fail();
    const jwk = RECOVERY_PUBLIC_JWK;
    if (createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url') !== RECOVERY_KEY_THUMBPRINT) fail();
    if (!verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), {
      key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363',
    }, signature)) fail();
    return Object.freeze(intent);
  } catch { fail(); }
}
