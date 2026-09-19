export function keccak256Bytes(input: Uint8Array): Uint8Array
/** Internal request shape validation; does not execute or authorize a build. */
export function validateFixtureRequest(value: unknown): unknown

/** Internal fixed-repository source materialization, not release authority. */
export function materializeCommit(
  commit: string,
  tree: string,
  modulePath: 'spacetimedb/genesis002' | 'spacetimedb/ptr',
  cleanRoot: string,
  realm: 'g002' | 'ptr',
): void

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
