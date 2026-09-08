import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { vi } from 'vitest';
// Synthetic signed receipt, matching the actual service codec; no production credentials.
const key = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256',
  x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE', y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA', d: '3Cfq7fh3QQUIL6yuWLcD7fYN4-26tQgG07i-8nj462o' } });
const order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
export function signedPreparationFixture(delta: Record<string, unknown> = {}) {
  const policy = { schemaVersion: 1, profile: 'warpkeep-recovery-preparation-policy-v1', enabled: true,
    authorizationEpoch: 3, workflowRef: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main',
    environment: 'notification-bridge-prepared', operation: 'activation-evidence-generate' };
  const intent = { schemaVersion: 1, profile: 'warpkeep-recovery-preparation-intent-v1',
    requestId: '123e4567-e89b-42d3-a456-426614174000', authorizationEpoch: 3,
    repository: 'ael-dev3/Warpkeep', repositoryId: '1273513252', repositoryOwnerId: '183124839',
    preparationCommit: 'c'.repeat(40), preparationTree: 'd'.repeat(40),
    policyDigest: createHash('sha256').update(`warpkeep-recovery-preparation-data-v1\n${JSON.stringify(policy)}`).digest('hex'),
    configuredArmingDigest: null, runId: '9007199254740995', runAttempt: '2', checkRunId: '9007199254740993', createdAt: 1700000000,
    ...delta };
  const payload = { schemaVersion: 1, profile: 'warpkeep-recovery-preparation-receipt-v1',
    iss: 'https://release-auth.warpkeep.com', aud: 'https://release-auth.warpkeep.com/preparation',
    purpose: 'activation-evidence-preparation', intent };
  const header = { alg: 'ES256', typ: 'warpkeep-recovery-preparation-receipt+jws', kid: 'warpkeep-0.4.0-recovery-2026-09-03-1' };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode(header)}.${encode(payload)}`;
  const signature = sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
  const s = BigInt(`0x${signature.subarray(32).toString('hex')}`);
  if (s > order / 2n) Buffer.from((order - s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
  return { compact: `${input}.${signature.toString('base64url')}`, intent };
}
export function preparationTransportFixture(change?: (url: string, init: RequestInit) => Response | undefined, delta: Record<string, unknown> = {}, observationDelta: Record<string, unknown> = {}) {
  const f = signedPreparationFixture(delta);
  const now = Math.floor(Date.now() / 1000);
  const observation = signedPreparationObservationFixture(f.intent, { observedFrom: now, observedThrough: now, issuedAt: now, expiresAt: now + 90, ...observationDelta });
  for (const [key, value] of Object.entries({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
    GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_JOB: 'operate', WARPKEEP_OPERATION: 'activation-evidence-generate',
    GITHUB_WORKFLOW_REF: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main',
    GITHUB_SHA: f.intent.preparationCommit, GITHUB_RUN_ID: '12', GITHUB_RUN_ATTEMPT: '2',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.actions.githubusercontent.com/token?api-version=2',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'test-only-oidc-request-credential' })) vi.stubEnv(key, value);
  const requests: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    const response = change?.(url, init) ?? new Response(JSON.stringify(url.startsWith('https://release-auth.')
      ? url.endsWith('/preparation-observation') ? { preparationObservationJws: observation.compact } : { preparationReceiptJws: f.compact } : { value: 'signed.oidc.fixture' }), { headers: { 'content-type': 'application/json' } });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  });
  return { ...f, observation: observation.observation, observationCompact: observation.compact, requests };
}

// Public test-key module for purpose-separated codec tests; no new key material.
const publicJwk = createPublicKey(key.export({ format: 'pem', type: 'pkcs8' })).export({ format: 'jwk' });
export const recoveryPreparationTestPublicKey = {
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_PUBLIC_JWK: publicJwk,
  RECOVERY_KEY_THUMBPRINT: createHash('sha256').update(JSON.stringify({
    crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x, y: publicJwk.y,
  })).digest('base64url'),
};
export function signedPreparationObservationFixture(
  intent: ReturnType<typeof signedPreparationFixture>['intent'],
  delta: Record<string, unknown> = {}, headerDelta: Record<string, unknown> = {},
) {
  const observation = {
    schemaVersion: 1, profile: 'warpkeep-recovery-preparation-observation-v1',
    iss: 'https://release-auth.warpkeep.com', aud: 'https://release-auth.warpkeep.com/preparation-observation',
    purpose: 'activation-evidence-worker-configuration', intent,
    bridgeService: 'warpkeep-auth-bridge', bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1',
    observedFrom: 1700000010, observedThrough: 1700000011,
    bridgeWorkerVersionId: '123e4567-e89b-42d3-a456-426614174002', bridgeSourceCommit: 'b'.repeat(40),
    bridgeConfigIdentity: 'a'.repeat(64), bridgeConfigEpoch: 5,
    issuedAt: 1700000012, expiresAt: 1700000101, ...delta,
  };
  const header = { alg: 'ES256', typ: 'warpkeep-recovery-preparation-observation+jws',
    kid: recoveryPreparationTestPublicKey.RECOVERY_KEY_ID, ...headerDelta };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode(header)}.${encode(observation)}`;
  const signature = sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
  const s = BigInt(`0x${signature.subarray(32).toString('hex')}`);
  if (s > order / 2n) Buffer.from((order - s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
  return { compact: `${input}.${signature.toString('base64url')}`, observation };
}
