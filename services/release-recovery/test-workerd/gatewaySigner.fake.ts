import { WorkerEntrypoint } from 'cloudflare:workers'
import { snapshotSignerRequest } from '../src/signerRequests.js'
import { snapshotPreparationRequest } from '../src/preparationPolicy.js'
import { snapshotPtrObservationRequest, snapshotPtrUpdateObservationRequest } from '../src/ptrObservation.js'
import type { ReleaseRecoveryObservationRequest } from '../src/realmEvidence.js'

/** Named RPC transport fixture only. Never exported by either production Worker. */
export class RecoveryGatewayTestSigner extends WorkerEntrypoint {
  async ptrUpdateObservation(request: unknown) {
    const value = snapshotPtrUpdateObservationRequest(request)
    if (value.oidcToken !== 'test-only.oidc.token') throw new Error('test-only-private-failure')
    return { ptrUpdateObservationJws: 'test-only-ptr-update-observation' }
  }
  async ptrObservation(request: unknown) {
    const value = snapshotPtrObservationRequest(request)
    if (value.oidcToken !== 'test-only.oidc.token') throw new Error('test-only-private-failure')
    return { ptrObservationJws: 'test-only-ptr-observation' }
  }
  async prepare(request: unknown) {
    snapshotPreparationRequest(request)
    return { preparationReceiptJws: 'test-only-preparation' }
  }
  #check(endpoint: string, request: unknown) {
    const value = snapshotSignerRequest(endpoint, request)
    if (endpoint !== 'terminal' && value.oidcToken !== 'test-only-oidc') throw new Error('test-only-private-failure')
    if (endpoint === 'claim' && value.authorizationJws !== 'test-only-authorization') throw new Error('test-only-private-failure')
    if ((endpoint === 'complete' || endpoint === 'reconcile') && value.claimReceiptJws !== 'test-only-claim') throw new Error('test-only-private-failure')
  }
  async status() { return { statusJws: 'test-only-status' } }
  async issue(request: unknown) { this.#check('issue', request); return { authorizationJws: 'test-only-authorization' } }
  async claim(request: unknown) { this.#check('claim', request); return { claimReceiptJws: 'test-only-claim' } }
  async complete(request: unknown) { this.#check('complete', request); return { terminalJws: 'test-only-terminal' } }
  async reconcile(request: unknown) { this.#check('reconcile', request); return { terminalJws: 'test-only-terminal' } }
  async terminal(request: unknown) { this.#check('terminal', request); return { terminalJws: 'test-only-terminal' } }
  async observeReleaseRecoveryState(request: ReleaseRecoveryObservationRequest) {
    if (request.rpcCredential !== 'test-only-rpc') throw new Error('test-only-invalid-observer-request')
    return { testOnlyObservation: true, requestId: request.requestId }
  }
}
