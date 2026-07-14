import type { VerifiedFarcasterIdentity } from '../../farcaster/farcasterAuthTypes';

export type RealmIdentity = Readonly<Pick<
  VerifiedFarcasterIdentity,
  'fid' | 'username' | 'displayName' | 'pfpUrl'
>>;

export type KeepLoadStatus = 'idle' | 'loading' | 'ready' | 'fallback';

export type RealmCastleScreenBounds = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

export type RealmCastleScreenProjection = Readonly<{
  castleId: number;
  q: number;
  r: number;
  x: number;
  y: number;
  distance: number;
  visible: boolean;
  /** Projected model silhouette used to keep its own label unobstructed. */
  castleBounds?: RealmCastleScreenBounds;
}>;

export type RealmCastleProjectionFrame = Readonly<{
  width: number;
  height: number;
  castles: readonly RealmCastleScreenProjection[];
}>;
