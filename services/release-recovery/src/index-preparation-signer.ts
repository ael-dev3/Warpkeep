import { WorkerEntrypoint } from 'cloudflare:workers'
import { withWorkflowCredential } from './signerWorkflowCredential.js'
import { prepareRecoveryFromEnvironment } from './signerPreparation.js'
import { observePreparationFromEnvironment, type PreparationObservationEnvironment } from './signerPreparationObservation.js'
import { observePtrFromEnvironment, observePtrUpdateFromEnvironment, observeG002UpdateFromEnvironment,
  type PtrObservationSignerEnvironment } from './signerPtrObservation.js'

export { ReleaseRecoveryAuthorizationLedgerV2 } from './ledgerDurableObjectV2.js'

type PreparationEnvironment = PreparationObservationEnvironment & PtrObservationSignerEnvironment

/** The existing disabled preparation phase must deploy before production realm
 * evidence can be collected. This entry has no recovery issuance/claim surface
 * or final fixture imports; each existing operator authenticates its own caller. */
export class ReleaseRecoverySignerEntrypoint extends WorkerEntrypoint<PreparationEnvironment> {
  async prepare(request: unknown, ...extra: unknown[]) { return prepareRecoveryFromEnvironment(withWorkflowCredential(this.env, extra), request) }
  async preparationObservation(request: unknown, ...extra: unknown[]) { return observePreparationFromEnvironment(withWorkflowCredential(this.env, extra), request) }
  async ptrObservation(request: unknown, ...extra: unknown[]) { return observePtrFromEnvironment(withWorkflowCredential(this.env, extra), request) }
  async ptrUpdateObservation(request: unknown, ...extra: unknown[]) { return observePtrUpdateFromEnvironment(withWorkflowCredential(this.env, extra), request) }
  async g002UpdateObservation(request: unknown, ...extra: unknown[]) { return observeG002UpdateFromEnvironment(withWorkflowCredential(this.env, extra), request) }
}

export default { fetch() { return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } }) } }
