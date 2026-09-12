import { observePreparationFromEnvironment } from './signerPreparationObservation.js'
import { observePtrFromEnvironment } from './signerPtrObservation.js'
import { prepareRecoveryFromEnvironment } from './signerPreparation.js'
import { WorkerEntrypoint } from 'cloudflare:workers'
import manifest from '../fixtures/spacetime/manifest.json'
import g001 from '../fixtures/spacetime/g001.raw-module-def-v10.json'
import g002 from '../fixtures/spacetime/g002.raw-module-def-v10.json'
import ptr from '../fixtures/spacetime/ptr.raw-module-def-v10.json'
import { signerFromEnvironment, type RecoverySignerEnvironment } from './signerEnvironment.js'

export { ReleaseRecoveryAuthorizationLedgerV2 } from './ledgerDurableObjectV2.js'

export class ReleaseRecoverySignerEntrypoint extends WorkerEntrypoint<RecoverySignerEnvironment> {
  async ptrObservation(request: unknown, ...extra: unknown[]) { return observePtrFromEnvironment(this.env, request, extra) }
  async preparationObservation(request: unknown, ...extra: unknown[]) { return observePreparationFromEnvironment(this.env, request, extra) }
  async prepare(request: unknown, ...extra: unknown[]) { return prepareRecoveryFromEnvironment(this.env, request, extra) }

  #signer() { return signerFromEnvironment(this.env, { manifest, g001, g002, ptr }) }
  async status(...args: []) { return this.#signer().status(...args) }
  async issue(request: unknown, ...extra: unknown[]) { return this.#signer().issue(request, ...extra) }
  async claim(request: unknown, ...extra: unknown[]) { return this.#signer().claim(request, ...extra) }
  async complete(request: unknown, ...extra: unknown[]) { return this.#signer().complete(request, ...extra) }
  async reconcile(request: unknown, ...extra: unknown[]) { return this.#signer().reconcile(request, ...extra) }
  async terminal(request: unknown, ...extra: unknown[]) { return this.#signer().terminal(request, ...extra) }
}

// No HTTP transport is provided, including through a service's default entrypoint.
export default { fetch() { return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } }) } }
