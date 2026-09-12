import type { ReleaseRecoveryObservationRequest, ReleaseRecoveryObservationService } from './realmEvidence.js'

/** Adapt only the deploy-owned named service binding. Evidence validation stays
 * in realmEvidence; this adapter neither accepts nor authenticates evidence. */
export function createSignerObservationService(service: ReleaseRecoveryObservationService): ReleaseRecoveryObservationService {
  const observe = service.observeReleaseRecoveryState
  return Object.freeze({
    async observeReleaseRecoveryState(request: ReleaseRecoveryObservationRequest) {
      // RPC callables route property lookups remotely, including `.call`.
      const value = await Reflect.apply(observe, service, [request])
      if (value === null || typeof value !== 'object') return value
      const lifecycle = Object.getOwnPropertyDescriptor(value, Symbol.dispose)
      // Only Workerd's nonenumerable RPC lifecycle field is transport metadata.
      // Preserve all other descriptors and the prototype for strict validation.
      if (lifecycle === undefined) return value
      if (lifecycle.enumerable || !Object.hasOwn(lifecycle, 'value') || typeof lifecycle.value !== 'function') {
        throw new Error('RECOVERY_REALM_EVIDENCE_FAILED')
      }
      try {
        const descriptors = Object.getOwnPropertyDescriptors(value)
        Reflect.deleteProperty(descriptors, Symbol.dispose)
        return Object.create(Object.getPrototypeOf(value), descriptors)
      } finally {
        try { lifecycle.value.call(value) } catch { /* Never expose RPC error material. */ }
      }
    },
  })
}
