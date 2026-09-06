import type { DbConnection } from '../../../spacetimedb/ptr/generated-bindings/index';
import type { Building04, Resource04, Cost04 } from '../../../spacetimedb/gameplay04/policy';
import type { Placement04 } from '../../../spacetimedb/gameplay04/placement';

type Procedures04 = InstanceType<typeof DbConnection>['procedures'];
export type ReadWire04 = Awaited<ReturnType<Procedures04['getGameplay04KeepV1']>>;
export type InitializeWire04 = Parameters<Procedures04['initializeGameplay04KeepV1']>[0];
export type DispatchWire04 = Parameters<Procedures04['dispatchGameplay04WorkerV1']>[0];
export type RecallWire04 = Parameters<Procedures04['recallGameplay04WorkerV1']>[0];
export type BuildWire04 = Parameters<Procedures04['startGameplay04BuildingV1']>[0];
export type ResultWire04 = Awaited<ReturnType<Procedures04['startGameplay04BuildingV1']>>;
export type Mutation04 =
  | Readonly<{ kind: 'initialize'; input: InitializeWire04 }>
  | Readonly<{ kind: 'dispatch'; input: DispatchWire04 }>
  | Readonly<{ kind: 'recall'; input: RecallWire04 }>
  | Readonly<{ kind: 'build'; input: BuildWire04 }>;
export type Scope04 = Readonly<{
  generation: number; databaseIdentity: string; anchorQ: number; anchorR: number;
}>;
export type Atlas04 = Readonly<{ atlasId: string; revision: bigint }>;
export type Target04 = Atlas04 & Readonly<{
  locationId: string; resource: Resource04; q: number; r: number;
}>;
export type BuildQuote04 = Readonly<{
  revision: bigint; atlasRevision: bigint; policyVersion: string; layoutDigest: string;
  kind: Building04; targetLevel: number; placement: Placement04;
  cost: Cost04; durationMicros: bigint;
}>;
export type Intent04 =
  | Readonly<{ kind: 'initialize' }>
  | Readonly<{ kind: 'dispatch'; workerOrdinal: number; target: Target04; durationMicros: bigint }>
  | Readonly<{ kind: 'recall'; workerOrdinal: number; atlasRevision: bigint }>
  | Readonly<{ kind: 'build'; quote: BuildQuote04 }>;
