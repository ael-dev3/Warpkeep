import { observeReleaseRecoveryConfiguration } from '../../auth-bridge/src/releaseRecoveryConfiguration.js'
import { bridgeEnv } from '../../auth-bridge/test/recoveryConfigurationFixture.js'
import { ReleaseRecoverySignerEntrypoint } from '../src/index-signer.js'
import type { RecoverySignerEnvironment } from '../src/signerEnvironment.js'
import { preparationPolicy, preparationPrivateJwk } from '../test/preparationFixture.js'
import { preparationTestAppPem } from './preparationAppKey.fake.js'
import { base64UrlEncode } from '../src/protocol.js'

/** Test deployment configuration only. Authentication, preparation and DO calls use production methods. */
export class RecoveryPreparationTestSigner extends ReleaseRecoverySignerEntrypoint {
  constructor(ctx: ExecutionContext, env: RecoverySignerEnvironment) {
    super(ctx, { ...env,
      AUTH_BRIDGE_OBSERVER: { ...env.AUTH_BRIDGE_OBSERVER, observeReleaseRecoveryConfiguration: request => observeReleaseRecoveryConfiguration(bridgeEnv({ RELEASE_RECOVERY_RPC_SECRET: base64UrlEncode(new Uint8Array(32).fill(1)) }), request) },
      RECOVERY_ENABLED: 'false', RECOVERY_AUTHORIZATION_EPOCH: '3', RECOVERY_ARMING_MANIFEST: '',
      RECOVERY_PREPARATION_POLICY: JSON.stringify(preparationPolicy),
      RECOVERY_SIGNING_PRIVATE_JWK: JSON.stringify(preparationPrivateJwk),
      RELEASE_RECOVERY_RPC_SECRET: base64UrlEncode(new Uint8Array(32).fill(1)),
      GITHUB_APP_ID: '17', GITHUB_APP_INSTALLATION_ID: '23', GITHUB_APP_PRIVATE_KEY_PEM: preparationTestAppPem,
    })
  }
  async probeWithoutPolicy(request: unknown) {
    const unconfigured = new ReleaseRecoverySignerEntrypoint(this.ctx, { ...this.env, RECOVERY_PREPARATION_POLICY: undefined })
    try { await unconfigured.prepare(request); return { code: 'UNEXPECTED_SUCCESS' } }
    catch (error) { return { code: error instanceof Error ? error.message : 'UNKNOWN_FAILURE' } }
  }
}
