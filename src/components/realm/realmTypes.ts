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
  /** True only when the individual castle mesh is paired with a placed label. */
  presented?: boolean;
  /** Calibrated roof silhouette used to keep its own label unobstructed. */
  castleBounds?: RealmCastleScreenBounds;
  /** Conservative projected model prism, kept separate from label attachment. */
  conservativeCastleBounds?: RealmCastleScreenBounds;
}>;

export type RealmCastleProjectionFrame = Readonly<{
  width: number;
  height: number;
  castles: readonly RealmCastleScreenProjection[];
}>;

/**
 * The public resource families that can host a gathering expedition. This is
 * presentation metadata only; it never grants a dispatch or settlement
 * capability.
 */
export type RealmResourceKind = 'gold' | 'food' | 'wood' | 'stone';

export type RealmResourceScreenProjection = Readonly<{
  resource: RealmResourceKind;
  siteId: string;
  x: number;
  y: number;
  depth: number;
  visible: boolean;
}>;

export type RealmResourceProjectionFrame = Readonly<{
  width: number;
  height: number;
  markers: readonly RealmResourceScreenProjection[];
}>;

export type RealmWorkerTravelPhase = 'outbound' | 'returning';

export type RealmWorkerScreenProjection = Readonly<{
  workerId: string;
  workerOrdinal: number;
  originCastleId: number;
  x: number;
  y: number;
  depth: number;
  visible: boolean;
  phase: RealmWorkerTravelPhase;
}>;

/**
 * Screen-space truth for the bounded moving-worker portrait lane. Public
 * identity remains outside this frame so renderer callbacks cannot widen the
 * browser's identity surface.
 */
export type RealmWorkerProjectionFrame = Readonly<{
  width: number;
  height: number;
  markers: readonly RealmWorkerScreenProjection[];
}>;
