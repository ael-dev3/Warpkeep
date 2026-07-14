export type QaObserverCastle = Readonly<{
  castleId: number;
  tileKey: string;
  q: number;
  r: number;
  level: number;
  name: string;
  canonicalUsername?: string;
  displayName?: string;
  portraitAvailable: boolean;
  publicBio?: string;
  publicStatus: string;
}>;

export type QaObserverSnapshot = Readonly<{
  version: 1;
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
  castles: readonly QaObserverCastle[];
}>;

export function parseQaObserverSnapshot(value: unknown): QaObserverSnapshot | undefined;
