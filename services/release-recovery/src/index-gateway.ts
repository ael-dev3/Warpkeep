import { createRecoveryGateway, type RecoverySignerService } from './gateway.js'

interface GatewayEnvironment { RECOVERY_SIGNER: RecoverySignerService }
export default {
  fetch(request: Request, env: GatewayEnvironment) {
    return createRecoveryGateway({ signer: env.RECOVERY_SIGNER, log: event => console.log(JSON.stringify(event)) }).fetch(request)
  },
} satisfies ExportedHandler<GatewayEnvironment>
