export const FIXED_PRIVATE_RECORD_PATHS: Readonly<{
  marker: string
  rpcSecret: string
  censusPepper: string
  canaryFid: string
  authBridgePublicJwk: string
  toolchainAttestation: string
  g002Receipt: string
  ptrReceipt: string
}>

export const FIXTURE_OUTPUT_PATHS: Readonly<{
  toolchain: string
  g001: string
  g002: string
  ptr: string
  manifest: string
}>

export class RecoveryFixtureInputError extends Error {
  readonly code: 'RECOVERY_FIXTURE_INPUT_INVALID'
}

export function parseGeneratorArguments(argv: readonly string[]): Readonly<{
  privateRoot: string
  mode: 'check' | 'write'
}>

export function runGenerator(input: unknown): Promise<Readonly<
  { verified: true } | { written: true }
>>
