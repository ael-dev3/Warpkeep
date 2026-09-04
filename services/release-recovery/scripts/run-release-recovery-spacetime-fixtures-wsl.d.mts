export const WSL_EXECUTION_POLICY: Readonly<{
  executable: 'wsl.exe'
  distribution: 'Ubuntu-24.04'
  unshare: readonly ['/usr/bin/unshare', '--user', '--map-root-user', '--net']
  unsharePackageVersion: '2.39.3-9ubuntu6.6'
  unshareSha256: 'a23c8863860669003dc4660039fe642f5795c8c2195898ebc5d01afa1ac3d11c'
  loopbackTool: '/usr/sbin/ip'
  loopbackPackageVersion: '6.1.0-1ubuntu6.2'
  loopbackToolSha256: '81a95d97c70f3677d1883b9d8fe13b1771ab208d5bca56bc447aaaff0b0480e0'
  network: 'loopback-only'
  buildsPerRealm: 2
  offlineAfterBootstrap: true
}>

export class RecoveryFixtureInputError extends Error {
  readonly code: 'RECOVERY_FIXTURE_INPUT_INVALID'
}

export function validateWslFixturePlan(value: unknown): unknown
export function validateWslFixtureResult(value: unknown): unknown
export function runReleaseRecoverySpacetimeFixturesWsl(input: unknown): Promise<unknown>
