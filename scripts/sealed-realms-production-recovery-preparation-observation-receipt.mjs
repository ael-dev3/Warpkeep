import { createHash, createPublicKey, verify } from 'node:crypto';
import { RECOVERY_KEY_ID, RECOVERY_PUBLIC_JWK, RECOVERY_KEY_THUMBPRINT } from './recovery-public-key.mjs';
import { verifySealedRealmsProductionRecoveryPreparationReceipt } from './sealed-realms-production-recovery-preparation-receipt.mjs';

const ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const fail = () => { throw Error('SEALED_REALMS_RECOVERY_PREPARATION_OBSERVATION_INVALID'); };
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) fail();
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) fail();
  return bytes;
}

/** Fresh service data bound to the complete signed reservation, never deployment authority. */
export function verifySealedRealmsProductionRecoveryPreparationObservation(compact, reservationCompact, now) {
  try {
    if (arguments.length !== 3 || typeof compact !== 'string' || compact.length > 16384
        || !Number.isSafeInteger(now)) fail();
    const intent = verifySealedRealmsProductionRecoveryPreparationReceipt(reservationCompact);
    const parts = compact.split('.');
    if (parts.length !== 3) fail();
    const [header, body, signature] = parts.map(decode);
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    if (decoder.decode(header) !== JSON.stringify({ alg: 'ES256',
      typ: 'warpkeep-recovery-preparation-observation+jws', kid: RECOVERY_KEY_ID })) fail();
    const raw = decoder.decode(body), value = JSON.parse(raw);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail();
    const { observedFrom, observedThrough, bridgeWorkerVersionId, bridgeSourceCommit,
      bridgeConfigIdentity, bridgeConfigEpoch, issuedAt } = value;
    if (!Number.isSafeInteger(observedFrom) || observedFrom < intent.createdAt
        || !Number.isSafeInteger(observedThrough) || observedThrough < observedFrom
        || observedThrough - observedFrom > 30 || observedThrough > Number.MAX_SAFE_INTEGER - 90
        || typeof bridgeWorkerVersionId !== 'string' || !UUID.test(bridgeWorkerVersionId)
        || typeof bridgeSourceCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(bridgeSourceCommit)
        || typeof bridgeConfigIdentity !== 'string' || !/^[a-f0-9]{64}$/u.test(bridgeConfigIdentity)
        || !Number.isSafeInteger(bridgeConfigEpoch) || bridgeConfigEpoch < 1
        || !Number.isSafeInteger(issuedAt) || issuedAt < observedThrough || issuedAt - observedThrough > 15) fail();
    const expected = {
      schemaVersion: 1, profile: 'warpkeep-recovery-preparation-observation-v1',
      iss: 'https://release-auth.warpkeep.com', aud: 'https://release-auth.warpkeep.com/preparation-observation',
      purpose: 'activation-evidence-worker-configuration', intent,
      bridgeService: 'warpkeep-auth-bridge', bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1',
      observedFrom, observedThrough, bridgeWorkerVersionId, bridgeSourceCommit, bridgeConfigIdentity, bridgeConfigEpoch,
      issuedAt, expiresAt: observedThrough + 90,
    };
    // Canonical re-encoding rejects duplicate, extra, reordered and substituted fields.
    if (JSON.stringify(expected) !== raw || now < issuedAt || now >= expected.expiresAt) fail();
    if (signature.length !== 64) fail();
    const r = BigInt(`0x${signature.subarray(0, 32).toString('hex')}`);
    const s = BigInt(`0x${signature.subarray(32).toString('hex')}`);
    if (r < 1n || r >= ORDER || s < 1n || s > ORDER / 2n) fail();
    const jwk = RECOVERY_PUBLIC_JWK;
    if (createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }))
      .digest('base64url') !== RECOVERY_KEY_THUMBPRINT) fail();
    if (!verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), {
      key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363',
    }, signature)) fail();
    return Object.freeze(expected);
  } catch { fail(); }
}
