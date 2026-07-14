import type { VerifiedFarcasterIdentity } from '../../farcaster/farcasterAuthTypes';

export type RealmIdentity = Readonly<Pick<
  VerifiedFarcasterIdentity,
  'fid' | 'username' | 'displayName' | 'pfpUrl'
>>;

export type KeepLoadStatus = 'idle' | 'loading' | 'ready' | 'fallback';

export type RealmCastleScreenProjection = Readonly<{
  castleId: number;
  q: number;
  r: number;
  x: number;
  y: number;
  distance: number;
  visible: boolean;
}>;

export type RealmCastleProjectionFrame = Readonly<{
  width: number;
  height: number;
  castles: readonly RealmCastleScreenProjection[];
}>;
