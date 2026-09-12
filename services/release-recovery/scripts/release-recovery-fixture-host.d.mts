export function openFixedPrivateRoot(requestedPath: unknown): Promise<unknown>
export function readFixedPrivateRecord(
  root: unknown,
  relativePath: unknown,
  maximumBytes: unknown,
): Promise<unknown>
export function closeFixedPrivateRoot(root: unknown): Promise<void>
export function verifyFixedPublishReceipt(input: unknown): Promise<unknown>
export function verifyFixedToolchainAttestation(input: unknown): Promise<unknown>
export function readFixedFixtureOutput(relativePath: unknown): Promise<Uint8Array>
export function recoverFixedFixtureOutputs(): Promise<void>
export function beginFixedFixtureOutputTransaction(input: unknown): Promise<unknown>
export function preflightFixedToolchainSourcePolicy(): Promise<unknown>
export function preflightFixedPublicSourceObjectDatabase(): Promise<unknown>
export function preflightFixedWslHostAndGuest(input: unknown): Promise<unknown>
export function bootstrapFixedWslToolchain(input: unknown): Promise<unknown>
export function publishFixedToolchainAttestation(input: unknown): Promise<unknown>
export function executeFixedWslFixturePlan(input: unknown): Promise<unknown>
