import {
  readReleaseRecoveryConfig,
  releaseRecoveryRpcCredentialMatches,
  type ReleaseRecoveryConfig,
} from './releaseRecoveryConfig'
import type { WorkerEnv } from './types'

export const RECOVERY_CONFIGURATION_REQUEST_PROFILE =
  'warpkeep-release-recovery-configuration-request-v1' as const
export const RECOVERY_CONFIGURATION_PROFILE = 'warpkeep-release-recovery-configuration-v1' as const
export type ReleaseRecoveryConfigurationRequest = Readonly<{
  schemaVersion: 1
  profile: typeof RECOVERY_CONFIGURATION_REQUEST_PROFILE
  rpcCredential: string
  requestId: string
  preparationCommit: string
  recoveryAuthorizationEpoch: number
}>
const fail = (): never => {
  throw new Error('RELEASE_RECOVERY_CONFIGURATION_FAILED')
}
function requestSnapshot(value: unknown): ReleaseRecoveryConfigurationRequest {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail()
  const d = Object.getOwnPropertyDescriptors(value),
    keys = [
      'schemaVersion',
      'profile',
      'rpcCredential',
      'requestId',
      'preparationCommit',
      'recoveryAuthorizationEpoch',
    ]
  if (Reflect.ownKeys(d).length !== keys.length) fail()
  const entries = keys.map((key) => {
    const p = d[key]
    if (!p?.enumerable || !Object.hasOwn(p, 'value')) fail()
    return [key, p.value]
  })
  const r = Object.fromEntries(entries)
  if (
    r.schemaVersion !== 1 ||
    r.profile !== RECOVERY_CONFIGURATION_REQUEST_PROFILE ||
    typeof r.rpcCredential !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/u.test(r.rpcCredential) ||
    typeof r.requestId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(r.requestId) ||
    typeof r.preparationCommit !== 'string' ||
    !/^[a-f0-9]{40}$/u.test(r.preparationCommit) ||
    !Number.isSafeInteger(r.recoveryAuthorizationEpoch) ||
    r.recoveryAuthorizationEpoch < 1
  )
    fail()
  return Object.freeze(r) as ReleaseRecoveryConfigurationRequest
}
/** Private config-only RPC: no realm reads, public route, or deployment authority. */
export async function observeReleaseRecoveryConfiguration(env: WorkerEnv, input: unknown) {
  let config: ReleaseRecoveryConfig | undefined
  let pending: Promise<ReleaseRecoveryConfig> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let live = true
  const started = Date.now(),
    observedFrom = Math.floor(started / 1000)
  const check = () => {
    const now = Date.now()
    if (!live || now < started || now - started > 30000) fail()
    return Math.floor(now / 1000)
  }
  try {
    const request = requestSnapshot(input)
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        live = false
        reject(new Error('RELEASE_RECOVERY_CONFIGURATION_FAILED'))
      }, 30000)
    })
    pending = readReleaseRecoveryConfig(env)
    config = await Promise.race([pending, expired])
    check()
    if (
      !(await Promise.race([
        releaseRecoveryRpcCredentialMatches(request.rpcCredential, config.rpcCredential),
        expired,
      ]))
    )
      fail()
    const observedThrough = check()
    return Object.freeze({
      schemaVersion: 1 as const,
      profile: RECOVERY_CONFIGURATION_PROFILE,
      requestId: request.requestId,
      preparationCommit: request.preparationCommit,
      recoveryAuthorizationEpoch: request.recoveryAuthorizationEpoch,
      observedFrom,
      observedThrough,
      bridgeService: config.bridgeService,
      bridgeWorkerVersion: config.bridgeWorkerVersion,
      bridgeWorkerVersionId: config.bridgeWorkerVersionId,
      bridgeSourceCommit: config.bridgeSourceCommit,
      bridgeConfigIdentity: config.bridgeConfigIdentity,
      bridgeConfigEpoch: config.bridgeConfigEpoch,
    })
  } catch {
    return fail()
  } finally {
    live = false
    clearTimeout(timer)
    if (config !== undefined) config.censusPepperBytes.fill(0)
    else if (pending !== undefined)
      void pending.then(
        (late) => {
          late.censusPepperBytes.fill(0)
        },
        () => {},
      )
  }
}
