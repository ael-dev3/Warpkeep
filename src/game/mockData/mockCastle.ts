import { createCastleForFid } from '../systems/gameLoop';
import type { NearbyCastle } from '../models/types';

export const nearbyFidCastles: NearbyCastle[] = [
  { fid: 18250, handle: 'stonecarver', level: 2, distance: 4, region: 'North Signal' },
  { fid: 9131, handle: 'ravenqueen', level: 3, distance: 7, region: 'Ravenmere' },
  { fid: 441, handle: 'banneret', level: 1, distance: 3, region: 'Bannerglen' },
  { fid: 271828, handle: 'mistlord', level: 4, distance: 12, region: 'Mistcourt' }
];

export const createMockGameState = () => ({
  ...createCastleForFid({ fid: 777, handle: 'ael' }),
  nearbyCastles: nearbyFidCastles
});
