export const FIXED_PRIVATE_ROOT: 'C:\\Users\\heyas\\.warpkeep\\private\\release-recovery-v1'

export const FIXED_PRIVATE_RECORD_PATHS: Readonly<{
  marker: string
  rpcSecret: string
  censusPepper: string
  canaryFid: string
  authBridgePublicJwk: string
  toolchainAttestation: string
  g002Receipt: string
  g002ImportReceipt: string
  g002LiveReceipt: string
  ptrReceipt: string
  ptrImportReceipt: string
  ptrOwnerReceipt: string
  ptrLiveReceipt: string
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

export function preflightFixedPrivatePrerequisites(input: unknown): Promise<Readonly<{
  g002: Readonly<Record<string, unknown>>
  ptr: Readonly<Record<string, unknown>>
  toolchain: Readonly<Record<string, unknown>>
}>>

export function preflightFixedBootstrapPrerequisites(input: unknown): Promise<Readonly<{
  g002: Readonly<Record<string, unknown>>
  ptr: Readonly<Record<string, unknown>>
}>>
