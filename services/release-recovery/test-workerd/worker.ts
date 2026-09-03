export { ReleaseRecoveryAuthorizationLedger } from '../src/ledgerDurableObject.js'

export default {
  fetch(): Response {
    return new Response(null, { status: 404 })
  },
} satisfies ExportedHandler<Cloudflare.Env>
