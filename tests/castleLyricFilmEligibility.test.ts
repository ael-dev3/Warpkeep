import { describe, expect, it } from 'vitest';

import {
  lyricFilmCastleIdFromPtrAnchor,
  lyricFilmCastleIdFromPublicCastles
} from '../src/components/realm/castleLyricFilmEligibility';

describe('lyric film castle identity', () => {
  it('maps the public keeper FID to its independent castle ID', () => {
    expect(lyricFilmCastleIdFromPublicCastles([
      { castleId: 539854, ownerFid: 123 },
      { castleId: 7, ownerFid: 539854 }
    ])).toBe(7);
  });

  it('fails closed without exactly one valid public owner mapping', () => {
    expect(lyricFilmCastleIdFromPublicCastles(undefined)).toBeUndefined();
    expect(lyricFilmCastleIdFromPublicCastles([
      { castleId: 539854, ownerFid: 123 }
    ])).toBeUndefined();
    expect(lyricFilmCastleIdFromPublicCastles([
      { castleId: 7, ownerFid: 539854 },
      { castleId: 8, ownerFid: 539854 }
    ])).toBeUndefined();
    expect(lyricFilmCastleIdFromPublicCastles([
      { castleId: 0, ownerFid: 539854 }
    ])).toBeUndefined();
  });

  it('uses the PTR virtual castle only for the verified owner anchor', () => {
    expect(lyricFilmCastleIdFromPtrAnchor(539854, 539854)).toBe(539854);
    expect(lyricFilmCastleIdFromPtrAnchor(123, 539854)).toBeUndefined();
    expect(lyricFilmCastleIdFromPtrAnchor(539854, 123)).toBeUndefined();
  });
});
