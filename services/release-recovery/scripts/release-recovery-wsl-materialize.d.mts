export function keccak256Bytes(input: Uint8Array): Uint8Array

export function validateToolchainManifestBytes(
  bytes: Uint8Array,
  toolchain: unknown,
  realmCoordinates: unknown,
  catalogEntries: ReadonlyMap<string, unknown>,
): any

export function verifyCacheCatalog(expectedSha256: string): any

export function readBoundedResponse(
  response: unknown,
  expectedUrl: string,
  maximumBytes: number,
): Promise<Uint8Array>
