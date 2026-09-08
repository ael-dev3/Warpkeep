import { observeReleaseRecoveryConfiguration, type ReleaseRecoveryConfigurationRequest } from './releaseRecoveryConfiguration'
import { WorkerEntrypoint } from 'cloudflare:workers'
import { createAuthBridge } from './app'
import {
  observeReleaseRecoveryState,
  type ReleaseRecoveryObservationRequest,
  type ReleaseRecoveryRealmObservation,
} from './releaseRecoveryObservation'
import type { WorkerEnv } from './types'

export {
  RELEASE_ATTESTATION_PATH,
  RELEASE_ATTESTATION_PROFILE,
  createAuthBridge,
} from './app'
export type { BridgeReleaseAttestation } from './app'
export {
  ADMISSION_NOTIFICATION_DELIVERY_CONTRACT_PROFILE,
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
