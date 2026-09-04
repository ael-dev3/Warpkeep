export const WSL_EXECUTION_POLICY: Readonly<{
  executable: 'C:\\Windows\\System32\\wsl.exe'
  executableBytes: 274432
  executableFileVersion: '10.0.26100.8737'
  executableProductVersion: '10.0.26100.8737'
  executableSha256: '27cc8dd52be326e138a89f8889241b1d8c51dd1978b22eb70be77036ccdee3c2'
  wslVersion: '2.7.11.0'
  distribution: 'Ubuntu-24.04'
  guestOsReleaseBytes: 400
  guestOsReleaseSha256: '01af466feb100306498c86aa6bad1815e33036019aa34d4362c20f374ea5c829'
  guestKernelRelease: '6.18.33.2-microsoft-standard-WSL2\n'
  guestKernelReleaseBytes: 34
  guestKernelReleaseSha256: '600c01e56d5afd93f0ecd74ff4ebb5ef91623d779bbba04388a866c3b581fc92'
  gitExecutable: '/usr/bin/git'
  gitVersion: 'git version 2.43.0'
  gitPackageVersion: '1:2.43.0-1ubuntu7.3'
  gitSha256: '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668'
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
