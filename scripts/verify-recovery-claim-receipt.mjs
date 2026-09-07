import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
export function verifyRecoveryClaimReceipt(...args) {
  try {
    const [compact, expectedSource, now] = args;
    if (args.length !== 3 || !integer(now) || typeof expectedSource !== 'string' || expectedSource.length > 16384) fail();
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
      || now < p.iat || now >= p.exp) fail();
    return Object.freeze({ authorizationEpoch: p.authorizationEpoch, claimSequence: p.claimSequence, issuedAt: p.iat, expiresAt: p.exp });
  } catch { fail(); }
}
let direct = false;
try { direct = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* imported */ }
if (direct) { process.stderr.write('RECOVERY_CLAIM_CLI_NOT_IMPLEMENTED\n'); process.exitCode = 1; }
