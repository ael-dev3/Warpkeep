import { createHash, createPublicKey, verify } from 'node:crypto';
import { RECOVERY_KEY_ID, RECOVERY_PUBLIC_JWK, RECOVERY_KEY_THUMBPRINT } from './recovery-public-key.mjs';
const ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const KEYS = Object.freeze({
  status: ['schemaVersion', 'profile', 'iss', 'aud', 'sub', 'kid', 'enabled', 'authorizationEpoch', 'iat', 'nbf', 'exp'],
  claim: ['schemaVersion', 'profile', 'iss', 'aud', 'sub', 'kid', 'requestId',
    'authorizationJti', 'authorizationJwsSha256', 'pagesRunId', 'pagesRunAttempt',
    'sourceVerifyRunId', 'sourceVerifyRunAttempt', 'candidateCommit', 'candidateTree',
    'artifactId', 'artifactName', 'githubArtifactArchiveSha256', 'innerArtifactTarSha256',
    'contentManifestSha256', 'deploymentAttestationSha256', 'operation', 'canonicalOrigin',
    'authorizationEpoch', 'claimSequence', 'claimedAt', 'claimDeadline', 'iat', 'nbf', 'exp'],
});
const fail = () => { throw new Error('RECOVERY_SIGNED_OBJECT_INVALID'); };
function decode(segment) {
  if (!/^[A-Za-z0-9_-]+$/u.test(segment)) fail();
  const bytes = Buffer.from(segment, 'base64url');
  if (bytes.toString('base64url') !== segment) fail();
  return bytes;
}
/** Pinned signature and byte grammar only; callers must apply kind-specific semantic gates. */
export function verifyRecoverySignedPayload(compact, kind) {
  try {
    if (!['status', 'claim'].includes(kind) || typeof compact !== 'string' || compact.length > 16384) fail();
    const segments = compact.split('.');
    if (segments.length !== 3) fail();
    const [header, body, signature] = segments.map(decode);
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    if (decoder.decode(header) !== JSON.stringify({ alg: 'ES256', typ: `warpkeep-0.4.0-recovery-${kind}+jwt`, kid: RECOVERY_KEY_ID })) fail();
    const raw = decoder.decode(body);
    const payload = JSON.parse(raw);
    const keys = KEYS[kind];
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)
      || Object.keys(payload).length !== keys.length
      || keys.some((key, index) => Object.keys(payload)[index] !== key)
      || JSON.stringify(payload) !== raw) fail();
    if (signature.length !== 64) fail();
    const r = BigInt(`0x${signature.subarray(0, 32).toString('hex')}`);
    const s = BigInt(`0x${signature.subarray(32).toString('hex')}`);
    if (r <= 0n || r >= ORDER || s <= 0n || s > ORDER / 2n) fail();
    const jwk = RECOVERY_PUBLIC_JWK;
    const thumbprint = createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url');
    if (thumbprint !== RECOVERY_KEY_THUMBPRINT) fail();
    const key = createPublicKey({ key: jwk, format: 'jwk' });
    if (!verify('sha256', Buffer.from(`${segments[0]}.${segments[1]}`), { key, dsaEncoding: 'ieee-p1363' }, signature)) fail();
    return Object.freeze(payload);
  } catch { fail(); }
}
