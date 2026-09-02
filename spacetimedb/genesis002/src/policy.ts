export type Genesis002PopulationSnapshot = Readonly<{
  allowedFids: bigint;
  accessRequests: bigint;
  playersV1: bigint;
  playersV2: bigint;
  ownershipBindings: bigint;
  castles: bigint;
  realmProfiles: bigint;
  termsAcceptances: bigint;
  markAccounts: bigint;
  resourceAccounts: bigint;
  castleClaims: bigint;
  cellOccupancies: bigint;
  activationRows: bigint;
  workerSystemRows: bigint;
}>;

export function assertGenesis002PopulationEmpty(
  snapshot: Genesis002PopulationSnapshot,
): void {
  if (Object.values(snapshot).some(count => count !== 0n)) {
    throw new Error('GENESIS_002_POPULATION_NOT_EMPTY');
  }
}

export function assertGenesis002AtlasNotFinalized(finalized: boolean): void {
  if (finalized) throw new Error('GENESIS_002_ATLAS_FINALIZED');
}

export function withGenesis002AtlasImportBoundary<T>(
  readPopulation: () => Genesis002PopulationSnapshot,
  effect: () => T,
): T {
  assertGenesis002PopulationEmpty(readPopulation());
  const result = effect();
  assertGenesis002PopulationEmpty(readPopulation());
  return result;
}
