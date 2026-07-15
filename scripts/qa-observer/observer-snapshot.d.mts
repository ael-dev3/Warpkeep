export type QaObserverSnapshot = Readonly<{
  version: 2;
  protocolVersion: 3;
  worldSeed: number;
  worldSeedName: string;
  worldTileCount: number;
  worldTileMetaCount: number;
  realm: Readonly<{
    realmId: string;
    numericSeed: number;
    generationVersion: number;
    authoritativeRadius: number;
    renderRadius: number;
    playerCapacity: number;
  }>;
  aggregates: Readonly<{
    castleCount: number;
    profileCount: number;
    foundedCount: number;
    activeCount: number;
  }>;
}>;

export function parseQaObserverSnapshot(value: unknown): QaObserverSnapshot | undefined;
