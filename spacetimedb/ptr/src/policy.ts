import {
  PTR_ATLAS_ID,
  PTR_MODULE_IDENTITY,
  PTR_RELEASE_VERSION,
} from './contract';

export type PtrPopulationSnapshot = Readonly<{
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

export function assertPtrPopulationEmpty(snapshot: PtrPopulationSnapshot): void {
  if (Object.values(snapshot).some(count => count !== 0n)) {
    throw new Error('PTR_POPULATION_NOT_EMPTY');
  }
}

export function assertPtrAtlasNotFinalized(finalized: boolean): void {
  if (finalized) throw new Error('PTR_ATLAS_FINALIZED');
}

export type PtrAtlasTarget = Readonly<{
  atlasId: string;
  ptrReleaseVersion: string;
  ptrModuleIdentity: string;
}>;

export function requirePtrAtlasTarget<T extends PtrAtlasTarget>(target: T): T {
  if (
    target.atlasId !== PTR_ATLAS_ID
    || target.ptrReleaseVersion !== PTR_RELEASE_VERSION
    || target.ptrModuleIdentity !== PTR_MODULE_IDENTITY
  ) throw new Error('PTR_ATLAS_TARGET_INVALID');
  return target;
}

export function withPtrAtlasImportBoundary<T>(
  readPopulation: () => PtrPopulationSnapshot,
  effect: () => T,
): T {
  assertPtrPopulationEmpty(readPopulation());
  const result = effect();
  assertPtrPopulationEmpty(readPopulation());
  return result;
}
