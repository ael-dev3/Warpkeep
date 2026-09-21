import { observePreparationFromEnvironment } from './signerPreparationObservation.js'
import { observePtrFromEnvironment, observePtrUpdateFromEnvironment, observeG002UpdateFromEnvironment } from './signerPtrObservation.js'
import { prepareRecoveryFromEnvironment } from './signerPreparation.js'
import { WorkerEntrypoint } from 'cloudflare:workers'
import { withWorkflowCredential } from './signerWorkflowCredential.js'
import manifest from '../fixtures/spacetime/manifest.json'
import g001 from '../fixtures/spacetime/g001.raw-module-def-v10.json'
import g002 from '../fixtures/spacetime/g002.raw-module-def-v10.json'
import ptr from '../fixtures/spacetime/ptr.raw-module-def-v10.json'
import { signerFromEnvironment, type RecoverySignerEnvironment } from './signerEnvironment.js'

export { ReleaseRecoveryAuthorizationLedgerV2 } from './ledgerDurableObjectV2.js'

export class ReleaseRecoverySignerEntrypoint extends WorkerEntrypoint<RecoverySignerEnvironment> {
  async g002UpdateObservation(request: unknown, ...extra: unknown[]) { return observeG002UpdateFromEnvironment(withWorkflowCredential(this.env, extra), request) }
  async ptrUpdateObservation(request: unknown, ...extra: unknown[]) { return observePtrUpdateFromEnvironment(withWorkflowCredential(this.env, extra), request) }
  async ptrObservation(request: unknown, ...extra: unknown[]) { return observePtrFromEnvironment(withWorkflowCredential(this.env, extra), request) }
  async preparationObservation(request: unknown, ...extra: unknown[]) { return observePreparationFromEnvironment(withWorkflowCredential(this.env, extra), request) }
  async prepare(request: unknown, ...extra: unknown[]) { return prepareRecoveryFromEnvironment(withWorkflowCredential(this.env, extra), request) }

  #signer(extra: readonly unknown[] = []) { return signerFromEnvironment(withWorkflowCredential(this.env, extra), { manifest, g001, g002, ptr }) }
  async status(...args: []) { return this.#signer().status(...args) }
  async issue(request: unknown, ...extra: unknown[]) { return this.#signer(extra).issue(request) }
  async claim(request: unknown, ...extra: unknown[]) { return this.#signer(extra).claim(request) }
  async complete(request: unknown, ...extra: unknown[]) { return this.#signer(extra).complete(request) }
  async reconcile(request: unknown, ...extra: unknown[]) { return this.#signer(extra).reconcile(request) }
  async terminal(request: unknown, ...extra: unknown[]) { return this.#signer().terminal(request, ...extra) }
}

// No HTTP transport is provided, including through a service's default entrypoint.
export default { fetch() { return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } }) } }
