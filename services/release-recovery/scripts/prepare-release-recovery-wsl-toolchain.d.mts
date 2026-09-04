export const TOOLCHAIN_BOOTSTRAP_POLICY: Readonly<Record<string, unknown>>

export class RecoveryFixtureInputError extends Error {
  readonly code: 'RECOVERY_FIXTURE_INPUT_INVALID'
}

export function parseToolchainArguments(argv: readonly string[]): Readonly<{
  privateRoot: string
}>

export function prepareReleaseRecoveryWslToolchain(input: unknown): Promise<Readonly<{
  prepared: true
}>>
