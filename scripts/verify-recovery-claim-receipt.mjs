import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { RECOVERY_KEY_ID } from './recovery-public-key.mjs';
import { verifyRecoverySignedPayload } from './recovery-authorization-protocol.mjs';
const EXPECTED_KEYS = ['requestId', 'authorizationJti', 'authorizationJwsSha256', 'pagesRunId', 'pagesRunAttempt',
  'sourceVerifyRunId', 'sourceVerifyRunAttempt', 'candidateCommit', 'candidateTree', 'artifactId', 'artifactName',
  'githubArtifactArchiveSha256', 'innerArtifactTarSha256', 'contentManifestSha256', 'deploymentAttestationSha256',
  'operation', 'canonicalOrigin', 'authorizationEpoch'];
const fail = () => { throw new Error('RECOVERY_CLAIM_INVALID'); };
const integer = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const hex = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`, 'u').test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const decimal = value => typeof value === 'string' && /^[1-9][0-9]*$/u.test(value);

/** Strict deployment-time gate; no post-expiry mode. Expectations require independently verified authority. */
function verifyClaim(compact, expectedSource, now, deployment) {
  try {
    if (!integer(now) || typeof expectedSource !== 'string' || expectedSource.length > 16384) fail();
    const expected = JSON.parse(expectedSource);
    if (expected === null || typeof expected !== 'object' || Array.isArray(expected)
      || Object.keys(expected).length !== EXPECTED_KEYS.length
      || EXPECTED_KEYS.some((key, index) => Object.keys(expected)[index] !== key)
      || JSON.stringify(expected) !== expectedSource) fail();
    const p = verifyRecoverySignedPayload(compact, 'claim');
    if (EXPECTED_KEYS.some(key => p[key] !== expected[key])) fail();
    if (p.schemaVersion !== 1 || p.profile !== 'warpkeep-0.4.0-recovery-claim-v1'
      || p.iss !== 'https://release-auth.warpkeep.com' || p.aud !== 'warpkeep-0.4.0-sealed-launch'
      || p.sub !== 'warpkeep-0.4.0-recovery-deployment-claim' || p.kid !== RECOVERY_KEY_ID
      || !uuid(p.requestId) || !uuid(p.authorizationJti)
      || !hex(p.candidateCommit, 40) || !hex(p.candidateTree, 40)
      || ['authorizationJwsSha256', 'githubArtifactArchiveSha256', 'innerArtifactTarSha256',
        'contentManifestSha256', 'deploymentAttestationSha256'].some(key => !hex(p[key], 64))
      || ['pagesRunId', 'pagesRunAttempt', 'sourceVerifyRunId', 'sourceVerifyRunAttempt', 'artifactId'].some(key => !decimal(p[key]))
      || p.pagesRunId === p.sourceVerifyRunId
      || p.artifactName !== `github-pages-recovery-${p.pagesRunId}-${p.pagesRunAttempt}`
      || p.operation !== 'github-pages-production-deploy' || p.canonicalOrigin !== 'https://warpkeep.com'
      || !integer(p.authorizationEpoch) || p.authorizationEpoch === 0
      || p.claimSequence !== 1
      || !integer(p.claimedAt) || !integer(p.claimDeadline) || p.claimDeadline !== p.claimedAt + 1200
      || !integer(p.iat) || !integer(p.exp) || p.claimedAt !== p.iat || p.nbf !== p.iat
      || p.exp <= p.iat || p.exp - p.iat > 120 || p.exp > p.claimDeadline
      || now < p.iat || now >= (deployment ? p.exp : p.claimDeadline)) fail();
    return p;
  } catch { fail(); }
}
/** Strict deployment gate; no caller-selectable expiry mode. */
export function verifyRecoveryClaimReceipt(...args) {
  if (args.length !== 3) fail();
  const p = verifyClaim(...args, true);
  return Object.freeze({ authorizationEpoch: p.authorizationEpoch, claimSequence: p.claimSequence, issuedAt: p.iat, expiresAt: p.exp });
}
/** Non-authorizing correlation only, including after exp but never at/after the signed ledger deadline. */
export function verifyRecoveryClaimCorrelation(...args) {
  if (args.length !== 3) fail();
  const p = verifyClaim(...args, false);
  return Object.freeze({ purpose: 'reconciliation-only', authorizationEpoch: p.authorizationEpoch,
    claimedAt: p.claimedAt, claimDeadline: p.claimDeadline });
}
/** Private canonical envelope: {claimReceiptJws, expectedSource}. No caller clock override. */
export async function verifyRecoveryClaimReceiptFromStdin(...args) {
  const [input] = args;
  const bytes = Buffer.alloc(65536);
  let length = 0;
  let timer;
  try {
    if (args.length !== 1 || !(input instanceof Readable) || input.isTTY
      || input.destroyed || input.readableDidRead || input.readableEncoding) fail();
    timer = setTimeout(() => input.destroy(new Error('RECOVERY_CLAIM_INVALID')), 5000);
    for await (const chunk of input) {
      try {
        if (!Buffer.isBuffer(chunk) || chunk.length > bytes.length - length) fail();
        chunk.copy(bytes, length); length += chunk.length;
      } finally { if (Buffer.isBuffer(chunk)) chunk.fill(0); }
    }
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length));
    const envelope = JSON.parse(source);
    if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)
      || Object.keys(envelope).join(',') !== 'claimReceiptJws,expectedSource'
      || JSON.stringify(envelope) !== source) fail();
    return verifyRecoveryClaimReceipt(envelope.claimReceiptJws, envelope.expectedSource, Math.floor(Date.now() / 1000));
  } catch { fail(); }
  finally {
    clearTimeout(timer); bytes.fill(0);
    if (input instanceof Readable) input.destroy();
  }
}
let direct = false;
try { direct = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* imported */ }
if (direct) {
  try {
    if (process.argv.length !== 2) fail();
    const result = await verifyRecoveryClaimReceiptFromStdin(process.stdin);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stdin.destroy(); process.stderr.write('RECOVERY_CLAIM_INVALID\n'); process.exitCode = 1;
  }
}
