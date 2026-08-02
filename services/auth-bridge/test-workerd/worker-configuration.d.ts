interface AuthBridgeBindings {
  CHALLENGE_REPLAY_GUARD: DurableObjectNamespace<
    import('../src/index').ChallengeReplayGuard
  >
  QA_CHALLENGE_REPLAY_GUARD: DurableObjectNamespace<
    import('../src/index').QaChallengeReplayGuard
  >
  AUTH_RATE_LIMITER: DurableObjectNamespace<
    import('../src/index').AuthRateLimiter
  >
  SESSION_FAMILIES: DurableObjectNamespace<
    import('../src/index').SessionFamily
  >
  ADMISSION_NOTIFICATIONS: DurableObjectNamespace<
    import('../src/index').AdmissionNotification
  >
}

declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import('../src/index')
    durableNamespaces: 'ChallengeReplayGuard' | 'QaChallengeReplayGuard' | 'AuthRateLimiter' | 'SessionFamily' | 'AdmissionNotification'
  }

  interface Env extends AuthBridgeBindings {}
}
