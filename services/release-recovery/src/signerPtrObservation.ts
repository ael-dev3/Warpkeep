import { githubFail, snapshotExactDataObject, type GitHubAppEnvironment } from './config.js'
import { capturePtrBridgeObservation, signPtrObservation, snapshotPtrObservationRequest, verifyPtrObservation,
  captureG002BridgeObservation, signG002UpdateObservation, snapshotG002UpdateObservationRequest,
  verifyG002UpdateObservation, verifyHistoricalG002UpdateObservation,
  signPtrUpdateObservation, snapshotPtrUpdateObservationRequest, verifyPtrUpdateObservation,
  verifyHistoricalPtrUpdateObservation } from './ptrObservation.js'
import { verifyPtrObservationWorkflowIdentity, verifyPtrUpdateObservationWorkflowIdentity,
  verifyG002UpdateObservationWorkflowIdentity } from './ptrObservationOidc.js'
import type { ReleaseRecoveryObservationService } from './realmEvidence.js'
import { validateSignerSecrets } from './signerSecrets.js'
import { createSignerObservationService } from './signerObservationService.js'

const CODE = 'RECOVERY_PTR_OBSERVATION_UNAVAILABLE'
const TOTAL_DEADLINE_MS = 100_000
const OBSERVER_DEADLINE_MS = 80_000

export type PtrObservationSignerEnvironment = GitHubAppEnvironment & Readonly<{
  RECOVERY_ENABLED: string
  RECOVERY_AUTHORIZATION_EPOCH: string
  RECOVERY_SIGNING_PRIVATE_JWK: string
  RELEASE_RECOVERY_RPC_SECRET: string
  AUTH_BRIDGE_OBSERVER: ReleaseRecoveryObservationService
}>

function deployment(env: PtrObservationSignerEnvironment) {
  const value = snapshotExactDataObject({ RECOVERY_ENABLED: env.RECOVERY_ENABLED,
    RECOVERY_AUTHORIZATION_EPOCH: env.RECOVERY_AUTHORIZATION_EPOCH },
  ['RECOVERY_ENABLED', 'RECOVERY_AUTHORIZATION_EPOCH'], CODE)
  if (value.RECOVERY_ENABLED !== 'false' || typeof value.RECOVERY_AUTHORIZATION_EPOCH !== 'string'
    || !/^[1-9][0-9]{0,15}$/u.test(value.RECOVERY_AUTHORIZATION_EPOCH)) githubFail(CODE)
  const authorizationEpoch = Number(value.RECOVERY_AUTHORIZATION_EPOCH)
  if (!Number.isSafeInteger(authorizationEpoch)) githubFail(CODE)
  return Object.freeze({ enabled: false as const, authorizationEpoch })
}

/** Observes existing PTR state through the private bridge capability. It does not
 * reserve recovery state or obtain import, provision, adoption, or mutation authority. */
export async function observePtrFromEnvironment(env: PtrObservationSignerEnvironment, input: unknown,
  extra: readonly unknown[] = []): Promise<Readonly<{ ptrObservationJws: string }>> {
  try {
    if (extra.length !== 0) githubFail(CODE)
    const request = snapshotPtrObservationRequest(input)
    const started = Date.now()
    const configured = deployment(env), configuredBytes = JSON.stringify(configured)
    const secrets = await validateSignerSecrets({ RECOVERY_SIGNING_PRIVATE_JWK: env.RECOVERY_SIGNING_PRIVATE_JWK,
      RELEASE_RECOVERY_RPC_SECRET: env.RELEASE_RECOVERY_RPC_SECRET })
    const githubApp = { GITHUB_APP_ID: env.GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID: env.GITHUB_APP_INSTALLATION_ID,
      GITHUB_APP_PRIVATE_KEY_PEM: env.GITHUB_APP_PRIVATE_KEY_PEM }
    const proof = await verifyPtrObservationWorkflowIdentity({ token: request.oidcToken,
      sourceCommit: request.sourceCommit, requestId: request.requestId, environment: githubApp,
      fetch: globalThis.fetch, nowSeconds: Math.floor(started / 1000) })
    const check = () => {
      const now = Date.now()
      if (now < started || now - started > TOTAL_DEADLINE_MS || Math.floor(now / 1000) >= proof.expiresAt
        || proof.identity.sourceCommit !== request.sourceCommit || proof.identity.requestId !== request.requestId
        || JSON.stringify(deployment(env)) !== configuredBytes) githubFail(CODE)
      return Math.floor(now / 1000)
    }
    check()
    const expected = Object.freeze({ requestId: request.requestId, candidateCommit: request.sourceCommit,
      recoveryAuthorizationEpoch: configured.authorizationEpoch })
    const from = check(), bridge = createSignerObservationService(env.AUTH_BRIDGE_OBSERVER)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const observed = await Promise.race([
        bridge.observeReleaseRecoveryState(Object.freeze({ schemaVersion: 1,
          profile: 'warpkeep-release-recovery-realm-observation-request-v1', rpcCredential: secrets.rpcCredential,
          ...expected })),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(CODE)), OBSERVER_DEADLINE_MS) }),
      ])
      clearTimeout(timer)
      const captured = capturePtrBridgeObservation(observed, expected, from, check())
      // Re-open both deploy-owned control and authenticated GitHub state after
      // crossing the private Worker RPC boundary and before creating a statement.
      check()
      const refreshed = await verifyPtrObservationWorkflowIdentity({ token: request.oidcToken,
        sourceCommit: request.sourceCommit, requestId: request.requestId, environment: githubApp,
        fetch: globalThis.fetch, nowSeconds: check() })
      if (JSON.stringify(refreshed.identity) !== JSON.stringify(proof.identity) || check() >= refreshed.expiresAt)
        githubFail(CODE)
      const ptrObservationJws = await signPtrObservation(proof.identity, captured, check(), secrets.privateJwk)
      const verified = await verifyPtrObservation(ptrObservationJws, proof.identity, check())
      // Verification samples time before awaiting crypto. Recheck the signed
      // observation's own interval immediately before releasing the result.
      const completedAt = check()
      if (completedAt < verified.issuedAt || completedAt >= verified.expiresAt) githubFail(CODE)
      return Object.freeze({ ptrObservationJws })
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return githubFail(CODE)
  }
}

/** Signs observed state tied to an operate_ptr request. The request's record
 * digests are correlation data, not proof of a private claim or permission to
 * update/adopt. Only the fixed adapter can supply that independent authority. */
export async function observePtrUpdateFromEnvironment(env: PtrObservationSignerEnvironment, input: unknown,
  extra: readonly unknown[] = []): Promise<Readonly<{ ptrUpdateObservationJws: string }>> {
  return Object.freeze({ ptrUpdateObservationJws: await observeExistingUpdateFromEnvironment(env, input, extra, 'ptr') })
}
/** Observes the fixed sealed G002 target; no receipt, permit or state mutation is issued. */
export async function observeG002UpdateFromEnvironment(env: PtrObservationSignerEnvironment, input: unknown,
  extra: readonly unknown[] = []): Promise<Readonly<{ g002UpdateObservationJws: string }>> {
  return Object.freeze({ g002UpdateObservationJws: await observeExistingUpdateFromEnvironment(env, input, extra, 'g002') })
}
async function observeExistingUpdateFromEnvironment(env: PtrObservationSignerEnvironment, input: unknown,
  extra: readonly unknown[], lane: 'ptr' | 'g002'): Promise<string> {
  const code = lane === 'g002' ? 'RECOVERY_G002_UPDATE_OBSERVATION_UNAVAILABLE' : 'RECOVERY_PTR_UPDATE_OBSERVATION_UNAVAILABLE'
  const verifyIdentity = lane === 'g002' ? verifyG002UpdateObservationWorkflowIdentity : verifyPtrUpdateObservationWorkflowIdentity
  const verifyHistorical = lane === 'g002' ? verifyHistoricalG002UpdateObservation : verifyHistoricalPtrUpdateObservation
  try {
    if (extra.length !== 0) githubFail(code)
    const request = lane === 'g002' ? snapshotG002UpdateObservationRequest(input) : snapshotPtrUpdateObservationRequest(input)
    const started = Date.now(), configured = deployment(env), configuredBytes = JSON.stringify(configured)
    const secrets = await validateSignerSecrets({ RECOVERY_SIGNING_PRIVATE_JWK: env.RECOVERY_SIGNING_PRIVATE_JWK,
      RELEASE_RECOVERY_RPC_SECRET: env.RELEASE_RECOVERY_RPC_SECRET })
    const githubApp = { GITHUB_APP_ID: env.GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID: env.GITHUB_APP_INSTALLATION_ID,
      GITHUB_APP_PRIVATE_KEY_PEM: env.GITHUB_APP_PRIVATE_KEY_PEM }
    const proof = await verifyIdentity({ token: request.oidcToken,
      sourceCommit: request.sourceCommit, requestId: request.requestId, environment: githubApp,
      fetch: globalThis.fetch, nowSeconds: Math.floor(started / 1000) })
    const check = () => {
      const now = Date.now()
      if (now < started || now - started > TOTAL_DEADLINE_MS || Math.floor(now / 1000) >= proof.expiresAt
        || proof.identity.sourceCommit !== request.sourceCommit || proof.identity.requestId !== request.requestId
        || JSON.stringify(deployment(env)) !== configuredBytes) githubFail(code)
      return Math.floor(now / 1000)
    }
    check()
    if (request.context.phase === 'pre') {
      if (request.context.claimRunId !== proof.identity.runId || request.context.claimRunAttempt !== proof.identity.runAttempt) githubFail(code)
    } else {
      const pre = await verifyHistorical('preObservationJws' in request ? request.preObservationJws : undefined)
      if (pre.context.phase !== 'pre' || pre.identity.sourceCommit !== proof.identity.sourceCommit
        || pre.identity.sourceTree !== proof.identity.sourceTree || pre.issuedAt > check()) githubFail(code)
    }
    const expected = Object.freeze({ requestId: request.requestId, candidateCommit: request.sourceCommit,
      recoveryAuthorizationEpoch: configured.authorizationEpoch })
    const from = check(), bridge = createSignerObservationService(env.AUTH_BRIDGE_OBSERVER)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const observed = await Promise.race([
        bridge.observeReleaseRecoveryState(Object.freeze({ schemaVersion: 1,
          profile: 'warpkeep-release-recovery-realm-observation-request-v1', rpcCredential: secrets.rpcCredential, ...expected })),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(code)), OBSERVER_DEADLINE_MS) }),
      ])
      clearTimeout(timer)
      const captured = lane === 'g002' ? captureG002BridgeObservation(observed, expected, from, check())
        : capturePtrBridgeObservation(observed, expected, from, check())
      const refreshed = await verifyIdentity({ token: request.oidcToken,
        sourceCommit: request.sourceCommit, requestId: request.requestId, environment: githubApp,
        fetch: globalThis.fetch, nowSeconds: check() })
      if (JSON.stringify(refreshed.identity) !== JSON.stringify(proof.identity) || check() >= refreshed.expiresAt) githubFail(code)
      const preObservationJws = 'preObservationJws' in request ? request.preObservationJws : undefined
      const compact = 'g002' in captured
        ? await signG002UpdateObservation(proof.identity, request.context, captured, check(), secrets.privateJwk, preObservationJws)
        : await signPtrUpdateObservation(proof.identity, request.context, captured, check(), secrets.privateJwk, preObservationJws)
      const verified = lane === 'g002' ? await verifyG002UpdateObservation(compact, proof.identity, request.context, check())
        : await verifyPtrUpdateObservation(compact, proof.identity, request.context, check())
      const completedAt = check()
      if (completedAt < verified.issuedAt || completedAt >= verified.expiresAt) githubFail(code)
      return compact
    } finally { clearTimeout(timer) }
  } catch { return githubFail(code) }
}
