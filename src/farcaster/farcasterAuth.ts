import type { FarcasterIdentity } from '../game/models/types';

export interface FarcasterAuthSession {
  status: 'placeholder' | 'authenticated';
  identity: FarcasterIdentity;
  notes: string[];
}

export const placeholderFarcasterSession: FarcasterAuthSession = {
  status: 'placeholder',
  identity: {
    fid: 777,
    handle: 'ael'
  },
  notes: [
    'Farcaster Sign In is the primary identity path.',
    'FID, not handle, is the stable key for castle ownership.',
    'Replace this placeholder with a SIWF flow before production multiplayer.'
  ]
};
