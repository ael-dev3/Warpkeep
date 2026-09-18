export const TOOLCHAIN_SOURCE_POLICY_PATH: string

export class RecoveryFixtureInputError extends Error {
  readonly code: 'RECOVERY_FIXTURE_INPUT_INVALID'
}

export function parseToolchainArguments(argv: readonly string[]): Readonly<{
  privateRoot: string
  evidence?: 'existing-state'
}>

export function prepareReleaseRecoveryWslToolchain(input: unknown): Promise<Readonly<{
  prepared: true
}>>
