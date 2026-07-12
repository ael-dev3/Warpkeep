import type { VerifiedFarcasterIdentity } from '../farcaster/farcasterAuthTypes';

export type WarpkeepAdmissionStatus =
  | 'not_admitted'
  | 'admitted_needs_bootstrap'
  | 'ready'
  | 'disabled';

export type WarpkeepBackendPhase =
  | 'idle'
  | 'connecting'
  | 'checking-admission'
  | 'denied'
  | 'bootstrapping'
  | 'ready'
  | 'error';

export type WarpkeepWorldTile = Readonly<{
  key: string;
  q: number;
  r: number;
  biome: string;
  terrainSeed: number;
  occupantCastleId?: number;
}>;

export type WarpkeepPlayer = Readonly<{
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  status: string;
}>;

export type WarpkeepCastle = Readonly<{
  castleId: number;
  ownerFid: number;
  tileKey: string;
  q: number;
  r: number;
  level: number;
  name: string;
}>;

export type WarpkeepRealmSnapshot = Readonly<{
  tiles: readonly WarpkeepWorldTile[];
  players: readonly WarpkeepPlayer[];
  castles: readonly WarpkeepCastle[];
  ownCastle?: WarpkeepCastle;
}>;

export type WarpkeepBackendState = Readonly<{
  phase: WarpkeepBackendPhase;
  identity?: VerifiedFarcasterIdentity;
  admission?: WarpkeepAdmissionStatus;
  realm?: WarpkeepRealmSnapshot;
}>;

export const IDLE_WARPKEEP_BACKEND_STATE: WarpkeepBackendState = Object.freeze({
  phase: 'idle'
});

export type WarpkeepBackendErrorCode = 'unconfigured' | 'unreachable' | 'unexpected';

export type WarpkeepBackendError = Readonly<{
  code: WarpkeepBackendErrorCode;
}>;
