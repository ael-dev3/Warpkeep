import { githubFail, snapshotExactDataObject, type GitHubAppEnvironment } from './config.js'
import { capturePtrBridgeObservation, signPtrObservation, snapshotPtrObservationRequest, verifyPtrObservation } from './ptrObservation.js'
import { verifyPtrObservationWorkflowIdentity } from './ptrObservationOidc.js'
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
