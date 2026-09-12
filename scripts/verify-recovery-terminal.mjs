import { RECOVERY_KEY_ID } from './recovery-public-key.mjs';
import { verifyRecoverySignedPayload } from './recovery-authorization-protocol.mjs';
// Reuses the private expectation document derived from verified authorization.
const EXPECTED_KEYS = ['requestId', 'authorizationJti', 'authorizationJwsSha256', 'pagesRunId', 'pagesRunAttempt',
  'sourceVerifyRunId', 'sourceVerifyRunAttempt', 'candidateCommit', 'candidateTree', 'artifactId', 'artifactName',
  'githubArtifactArchiveSha256', 'innerArtifactTarSha256', 'contentManifestSha256', 'deploymentAttestationSha256',
  'operation', 'canonicalOrigin', 'authorizationEpoch'];
const fail = () => { throw new Error('RECOVERY_TERMINAL_INVALID'); };
const integer = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const hex = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`, 'u').test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const decimal = value => typeof value === 'string' && /^[1-9][0-9]*$/u.test(value);

/** Fresh terminal audit evidence only; never a deployment permit. Keep expectedSource private. */
export function verifyRecoveryTerminal(...args) {
  try {
    const [compact, expectedSource, now] = args;
    if (args.length !== 3 || !integer(now) || typeof expectedSource !== 'string' || expectedSource.length > 16384) fail();
    const expected = JSON.parse(expectedSource);
    if (expected === null || typeof expected !== 'object' || Array.isArray(expected)
      || Object.keys(expected).length !== EXPECTED_KEYS.length
      || EXPECTED_KEYS.some((key, index) => Object.keys(expected)[index] !== key)
      || JSON.stringify(expected) !== expectedSource) fail();
    const p = verifyRecoverySignedPayload(compact, 'terminal');
    if (EXPECTED_KEYS.some(key => p[key] !== expected[key])) fail();
    if (p.schemaVersion !== 1 || p.profile !== 'warpkeep-0.4.0-recovery-terminal-v1'
      || p.iss !== 'https://release-auth.warpkeep.com' || p.aud !== 'warpkeep-0.4.0-sealed-launch'
      || p.sub !== 'warpkeep-0.4.0-recovery-terminal-attestation' || p.kid !== RECOVERY_KEY_ID
      || !uuid(p.requestId) || !uuid(p.authorizationJti)
      || !hex(p.candidateCommit, 40) || !hex(p.candidateTree, 40)
      || ['authorizationJwsSha256', 'githubArtifactArchiveSha256', 'innerArtifactTarSha256',
        'contentManifestSha256', 'deploymentAttestationSha256'].some(key => !hex(p[key], 64))
      || ['pagesRunId', 'pagesRunAttempt', 'sourceVerifyRunId', 'sourceVerifyRunAttempt', 'artifactId'].some(key => !decimal(p[key]))
      || p.pagesRunId === p.sourceVerifyRunId
      || p.artifactName !== `github-pages-recovery-${p.pagesRunId}-${p.pagesRunAttempt}`
      || p.operation !== 'github-pages-production-deploy' || p.canonicalOrigin !== 'https://warpkeep.com'
      || !integer(p.authorizationEpoch) || p.authorizationEpoch === 0
      || !integer(p.completedAt) || !integer(p.iat) || p.completedAt > p.iat
      || p.nbf !== p.iat || !integer(p.exp) || p.exp <= p.iat || p.exp - p.iat > 900
      || now < p.iat || now >= p.exp || !['completed', 'not-deployed'].includes(p.outcome)) fail();
    return Object.freeze({ outcome: p.outcome, completedAt: p.completedAt,
      authorizationEpoch: p.authorizationEpoch, issuedAt: p.iat, expiresAt: p.exp });
  } catch { fail(); }
}
