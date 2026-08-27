import {
  isGenesis002AdmissionMutation,
  type Genesis002AdmissionMutation,
} from './contract';

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

export class Genesis002AdmissionsSealedError extends Error {
  readonly code = 'GENESIS_002_ADMISSIONS_SEALED';
  readonly mutation: Genesis002AdmissionMutation;

  constructor(mutation: Genesis002AdmissionMutation) {
    super('GENESIS_002_ADMISSIONS_SEALED');
    this.name = 'Genesis002AdmissionsSealedError';
    this.mutation = mutation;
  }
}

/**
 * Total fail-closed boundary. The effect is deliberately accepted only so
 * tests and future reducer bodies can prove the denial happens before it.
 */
export function executeGenesis002SealedMutation(
  mutation: Genesis002AdmissionMutation,
  effect: () => never,
): never {
  if (!isGenesis002AdmissionMutation(mutation)) {
    throw new Error('GENESIS_002_UNKNOWN_MUTATION');
  }
  throw new Genesis002AdmissionsSealedError(mutation);

  // Keep the effect in the type-level contract without making it reachable.
  // eslint-disable-next-line no-unreachable
  return effect();
}
