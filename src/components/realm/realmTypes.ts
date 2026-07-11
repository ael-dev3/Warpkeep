import type { VerifiedFarcasterIdentity } from '../../farcaster/farcasterAuthTypes';

export type RealmIdentity = Readonly<Pick<
  VerifiedFarcasterIdentity,
  'fid' | 'username' | 'displayName'
>>;

export type KeepLoadStatus = 'idle' | 'loading' | 'ready' | 'fallback';
