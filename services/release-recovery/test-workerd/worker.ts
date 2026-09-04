export { ReleaseRecoveryAuthorizationLedger } from '../src/ledgerDurableObject.js'
export { ReleaseRecoveryAuthorizationLedgerV2 } from '../src/ledgerDurableObjectV2.js'

export default {
  fetch(): Response {
    return new Response(null, { status: 404 })
  },
} satisfies ExportedHandler<Cloudflare.Env>
