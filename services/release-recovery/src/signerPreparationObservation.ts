import { githubFail, snapshotExactDataObject } from './config.js'
import { parsePreparationDeployment, snapshotPreparationRequest } from './preparationPolicy.js'
import { verifyPreparationWorkflowIdentity } from './preparationOidc.js'
import { snapshotPreparationIntent, type PreparationIntent } from './preparationIntent.js'
import { validateSignerSecrets } from './signerSecrets.js'
import { signPreparationObservation, snapshotPreparationWorkerCoordinates } from './preparationObservation.js'
import type { PreparationSignerEnvironment } from './signerPreparation.js'

export type PreparationConfigurationService = Readonly<{
  observeReleaseRecoveryConfiguration?(request: Readonly<Record<string, string | number>>): Promise<unknown>
}>
export type PreparationObservationEnvironment = PreparationSignerEnvironment &
  Readonly<{ AUTH_BRIDGE_OBSERVER: PreparationConfigurationService }>
const CODE = 'RECOVERY_PREPARATION_OBSERVATION_UNAVAILABLE'
/** Strip only RPC lifecycle metadata, closing even malformed remote results. */
function rpcData(value: unknown): unknown {
  if (value === null || typeof value !== 'object') githubFail(CODE)
  const lifecycle = Object.getOwnPropertyDescriptor(value, Symbol.dispose)
  if (lifecycle === undefined) return value
  if (lifecycle.enumerable || !Object.hasOwn(lifecycle, 'value') || typeof lifecycle.value !== 'function')
    githubFail(CODE)
  try {
    const d = Object.getOwnPropertyDescriptors(value)
    Reflect.deleteProperty(d, Symbol.dispose)
    return Object.create(Object.getPrototypeOf(value), d)
  } finally {
    try {
      Reflect.apply(lifecycle.value, value, [])
    } catch {}
  }
}
function captureObservation(value: unknown, intent: PreparationIntent, from: number, through: number) {
  const r = snapshotExactDataObject(
    value,
    [
      'schemaVersion',
      'profile',
      'requestId',
      'preparationCommit',
      'recoveryAuthorizationEpoch',
      'observedFrom',
      'observedThrough',
      'bridgeService',
      'bridgeWorkerVersion',
      'bridgeWorkerVersionId',
      'bridgeSourceCommit',
      'bridgeConfigIdentity',
      'bridgeConfigEpoch',
    ],
    CODE,
  )
  if (
    r.schemaVersion !== 1 ||
    r.profile !== 'warpkeep-release-recovery-configuration-v1' ||
    r.requestId !== intent.requestId ||
    r.preparationCommit !== intent.preparationCommit ||
    r.recoveryAuthorizationEpoch !== intent.authorizationEpoch ||
    r.bridgeService !== 'warpkeep-auth-bridge' ||
    r.bridgeWorkerVersion !== 'warpkeep-auth-bridge-release-recovery-v1'
  )
    githubFail(CODE)
  const coordinates = snapshotPreparationWorkerCoordinates(
    Object.fromEntries(
      [
        'observedFrom',
        'observedThrough',
        'bridgeWorkerVersionId',
        'bridgeSourceCommit',
        'bridgeConfigIdentity',
        'bridgeConfigEpoch',
      ].map((k) => [k, r[k]]),
    ),
  )
  if (coordinates.observedFrom < from || coordinates.observedThrough > through) githubFail(CODE)
  return coordinates
}
export async function observePreparationFromEnvironment(
  env: PreparationObservationEnvironment,
  input: unknown,
  extra: readonly unknown[] = [],
): Promise<Readonly<{ preparationObservationJws: string }>> {
  if (extra.length !== 0) githubFail(CODE)
  const request = snapshotPreparationRequest(input)
  const deploymentInput = () => ({
    RECOVERY_ENABLED: env.RECOVERY_ENABLED,
    RECOVERY_AUTHORIZATION_EPOCH: env.RECOVERY_AUTHORIZATION_EPOCH,
    RECOVERY_ARMING_MANIFEST: env.RECOVERY_ARMING_MANIFEST,
    RECOVERY_PREPARATION_POLICY: env.RECOVERY_PREPARATION_POLICY,
  })
  const deployment = parsePreparationDeployment(deploymentInput()),
    deploymentBytes = JSON.stringify(deployment)
  const githubApp = {
    GITHUB_APP_ID: env.GITHUB_APP_ID,
    GITHUB_APP_INSTALLATION_ID: env.GITHUB_APP_INSTALLATION_ID,
    GITHUB_APP_PRIVATE_KEY_PEM: env.GITHUB_APP_PRIVATE_KEY_PEM,
  }
  const secrets = await validateSignerSecrets({
    RECOVERY_SIGNING_PRIVATE_JWK: env.RECOVERY_SIGNING_PRIVATE_JWK,
    RELEASE_RECOVERY_RPC_SECRET: env.RELEASE_RECOVERY_RPC_SECRET,
  })
  const started = Date.now()
  const proof = await verifyPreparationWorkflowIdentity({
    token: request.oidcToken,
    preparationCommit: request.preparationCommit,
    environment: githubApp,
    fetch: globalThis.fetch,
    nowSeconds: Math.floor(started / 1000),
  })
  const check = () => {
    const now = Date.now()
    if (
      now < started ||
      now - started > 90000 ||
      Math.floor(now / 1000) >= proof.expiresAt ||
      proof.identity.preparationCommit !== request.preparationCommit ||
      JSON.stringify(parsePreparationDeployment(deploymentInput())) !== deploymentBytes
    )
      githubFail(CODE)
    return Math.floor(now / 1000)
  }
  check()
  const control = env.RECOVERY_LEDGER_V2.getByName('warpkeep-release-recovery-control-v2')
  const reservation = await control.reservePreparationIntent({
    ...deployment,
    identity: proof.identity,
    now: check(),
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const intent = snapshotPreparationIntent(reservation.intent)
    const current = async () => {
      check()
      const result = await control.assertPreparationObservationIntent(intent)
      try {
        if (JSON.stringify(snapshotPreparationIntent(result.intent)) !== JSON.stringify(intent))
          githubFail(CODE)
      } finally {
        result[Symbol.dispose]()
      }
      check()
    }
    await current()
    const from = check(),
      service = env.AUTH_BRIDGE_OBSERVER,
      observe = service.observeReleaseRecoveryConfiguration
    if (typeof observe !== 'function') githubFail(CODE)
    const pending = Promise.resolve(
      Reflect.apply(observe, service, [
        Object.freeze({
          schemaVersion: 1,
          profile: 'warpkeep-release-recovery-configuration-request-v1',
          rpcCredential: secrets.rpcCredential,
          requestId: intent.requestId,
          preparationCommit: intent.preparationCommit,
          recoveryAuthorizationEpoch: intent.authorizationEpoch,
        }),
      ]),
    ).then(rpcData)
    const value = await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(CODE)), 30000)
      }),
    ])
    clearTimeout(timer)
    const coordinates = captureObservation(value, intent, from, check())
    // The Worker RPC is an asynchronous authority boundary. Re-open the actual
    // protected source/run proof before signing, not only its prior lease.
    const refreshed = await verifyPreparationWorkflowIdentity({
      token: request.oidcToken,
      preparationCommit: request.preparationCommit,
      environment: githubApp,
      fetch: globalThis.fetch,
      nowSeconds: check(),
    })
    check()
    if (JSON.stringify(refreshed.identity) !== JSON.stringify(proof.identity)
      || check() >= refreshed.expiresAt) githubFail(CODE)
    await current()
    const preparationObservationJws = await signPreparationObservation(
      intent,
      coordinates,
      check(),
      secrets.privateJwk,
    )
    await current()
    if (check() >= coordinates.observedThrough + 90) githubFail(CODE)
    return Object.freeze({ preparationObservationJws })
  } catch {
    githubFail(CODE)
  } finally {
    clearTimeout(timer)
    reservation[Symbol.dispose]()
  }
}
