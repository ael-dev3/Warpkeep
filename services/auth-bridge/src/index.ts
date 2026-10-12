import { observeReleaseRecoveryConfiguration, type ReleaseRecoveryConfigurationRequest } from './releaseRecoveryConfiguration'
import { WorkerEntrypoint } from 'cloudflare:workers'
import { createAuthBridge } from './app'
import {
  observeReleaseRecoveryState,
  type ReleaseRecoveryObservationRequest,
  type ReleaseRecoveryRealmObservation,
} from './releaseRecoveryObservation'
import type { WorkerEnv } from './types'

// Workerd treats every value export as a runtime entrypoint. Keep metadata
// constants in their owning modules: primitive exports prevent Worker startup.
export { createAuthBridge } from './app'
export type { BridgeReleaseAttestation } from './app'
export {
  AdmissionNotification,
  DurableObjectAdmissionNotificationStore,
  admissionNotificationDeliveryContractDigest,
  admissionNotificationDeliveryContractVector,
  serializeAdmissionNotificationDeliveryContract,
} from './admissionNotifications'
export { ChallengeReplayGuard, DurableObjectChallengeStore, MemoryChallengeStore } from './challengeStore'
export {
  DurableObjectQaObserverChallengeStore,
  MemoryQaObserverChallengeStore,
  QaChallengeReplayGuard,
} from './qaObserver'
export { AuthRateLimiter } from './rateLimit'
export {
  DurableObjectSessionFamilyStore,
  MemorySessionFamilyStore,
  SessionFamily,
} from './sessionFamily'
export { SpacetimeHttpAccessRequestResolver } from './spacetimeAccessRequestResolver'
export { SpacetimeHttpAuthEpochResolver } from './spacetimeAuthEpochResolver'
export { SpacetimeHttpQaObserverResolver } from './spacetimeQaObserverResolver'
export {
  createMiniAppWebhookVerifier,
  MiniAppWebhookInvalidError,
  MiniAppWebhookVerifierUnavailableError,
} from './miniAppWebhook'
export type * from './types'

export class ReleaseRecoveryObservationEntrypoint extends WorkerEntrypoint<WorkerEnv> {
  async observeReleaseRecoveryConfiguration(request: ReleaseRecoveryConfigurationRequest, ...extra: unknown[]) {
    if (extra.length !== 0) throw new Error('RELEASE_RECOVERY_CONFIGURATION_FAILED')
    return observeReleaseRecoveryConfiguration(this.env, request)
  }
  async observeReleaseRecoveryState(
    request: ReleaseRecoveryObservationRequest,
  ): Promise<ReleaseRecoveryRealmObservation> {
    return observeReleaseRecoveryState(this.env, request)
  }
}

export default createAuthBridge()
