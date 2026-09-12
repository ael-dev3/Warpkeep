export { ReleaseRecoveryAuthorizationLedger } from '../src/ledgerDurableObject.js'
export { ReleaseRecoveryAuthorizationLedgerV2 } from '../src/ledgerDurableObjectV2.js'
export { RecoveryGatewayTestSigner } from './gatewaySigner.fake.js'
export { RecoveryPreparationTestSigner } from './preparationSigner.fake.js'

export default {
  fetch(): Response {
    return new Response(null, { status: 404 })
  },
} satisfies ExportedHandler<Cloudflare.Env>
