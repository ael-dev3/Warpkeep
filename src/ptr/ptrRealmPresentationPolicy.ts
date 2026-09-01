import {
  isCurrentPtrRealmAuthority,
  type PtrRealmAuthority,
} from './ptrRealmAuthClient';

const I32_MINIMUM = -2_147_483_648;
const I32_MAXIMUM = 2_147_483_647;

export type PtrRealmViewAnchor = Readonly<{
  castleId: number;
  q: number;
  r: number;
}>;

export type PtrRealmPresentation = Readonly<{
  authority: PtrRealmAuthority;
  viewAnchor: PtrRealmViewAnchor;
}>;

function safeI32(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= I32_MINIMUM
    && (value as number) <= I32_MAXIMUM;
}

/**
 * A PTR renderer receives only a virtual atlas anchor. Any simultaneous
 * Genesis surface, forged authority, expired authority, or malformed anchor
 * closes the branch before renderer effects mount.
 */
export function resolvePtrRealmPresentation(input: Readonly<{
  authority: PtrRealmAuthority;
  viewAnchor: PtrRealmViewAnchor;
  legacySurfacePresent: boolean;
}>): PtrRealmPresentation | null {
  if (
    input.legacySurfacePresent
    || !isCurrentPtrRealmAuthority(input.authority)
    || !Number.isSafeInteger(input.viewAnchor.castleId)
    || input.viewAnchor.castleId <= 0
    || input.viewAnchor.castleId !== input.authority.fid
    || !safeI32(input.viewAnchor.q)
    || !safeI32(input.viewAnchor.r)
  ) return null;
  return Object.freeze({
    authority: input.authority,
    viewAnchor: Object.freeze({
      castleId: input.viewAnchor.castleId,
      q: input.viewAnchor.q,
      r: input.viewAnchor.r,
    }),
  });
}
