import { ChallengeReplayGuard } from './challengeStore'
import { createAuthBridge } from './app'

export { ChallengeReplayGuard }
export { createAuthBridge } from './app'
export { DurableObjectChallengeStore, MemoryChallengeStore } from './challengeStore'
export { SpacetimeHttpAuthEpochResolver } from './spacetimeAuthEpochResolver'
export type * from './types'

export default createAuthBridge()
