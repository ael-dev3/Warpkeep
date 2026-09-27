import { WARPKEEP_LYRIC_FILM_OWNER_FID } from './CastleLyricFilmAction';

type PublicCastleIdentity = Readonly<{ castleId: number; ownerFid: number }>;

/** Use the existing public castle identity, never infer an owner from a castle ID. */
export function lyricFilmCastleIdFromPublicCastles(
  castles: readonly PublicCastleIdentity[] | undefined
): number | undefined {
  if (castles === undefined) return undefined;
  const matches = castles.filter((castle) => (
    castle.ownerFid === WARPKEEP_LYRIC_FILM_OWNER_FID
  ));
  if (matches.length !== 1) return undefined;
  const castleId = matches[0]!.castleId;
  return Number.isSafeInteger(castleId) && castleId > 0 ? castleId : undefined;
}

/** PTR publishes only its verified caller's virtual castle, whose ID is the FID. */
export function lyricFilmCastleIdFromPtrAnchor(
  ownerFid: number,
  castleId: number
): number | undefined {
  return ownerFid === WARPKEEP_LYRIC_FILM_OWNER_FID
    && castleId === WARPKEEP_LYRIC_FILM_OWNER_FID
    ? castleId
    : undefined;
}
