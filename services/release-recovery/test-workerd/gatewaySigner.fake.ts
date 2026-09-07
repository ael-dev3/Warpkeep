import { WorkerEntrypoint } from 'cloudflare:workers'
import { snapshotSignerRequest } from '../src/signerRequests.js'

/** Named RPC transport fixture only. Never exported by either production Worker. */
export class RecoveryGatewayTestSigner extends WorkerEntrypoint {
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
}
