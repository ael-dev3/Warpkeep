import type { VerifiedFarcasterIdentity } from '../../farcaster/farcasterAuthTypes';

export const SHOWCASE_WARPLET_GUARDIAN_URL =
  'models/menu/warplet-guardian-v2-e934a81ae2a210e4.glb';

export type MenuWarpletAssignment = Readonly<{
  fid: number;
  guardianUrl: string;
  provenance: Readonly<{
    checkedOn: string;
    sourceUrl: string;
    note: string;
  }>;
}>;

/** Add player-specific models here only after the numeric FID is verified. */
export const MENU_WARPLET_ASSIGNMENTS: readonly MenuWarpletAssignment[] = Object.freeze([
  {
    fid: 539854,
    guardianUrl: SHOWCASE_WARPLET_GUARDIAN_URL,
    provenance: {
      checkedOn: '2026-09-27',
      sourceUrl: 'https://api.warpcast.com/v2/user-by-username?username=0xael.eth',
      note: 'Public Warpcast lookup for 0xael.eth returned FID 539854 and the warpkeep.com profile. Runtime selection uses the verified numeric FID only.'
    }
  }
]);

export type MenuWarpletSelection =
  | Readonly<{
    kind: 'showcase';
    guardianUrl: string;
    sceneKey: 'anonymous-showcase';
  }>
  | Readonly<{
    kind: 'assigned';
    fid: number;
    guardianUrl: string;
    sceneKey: string;
    provenance: MenuWarpletAssignment['provenance'];
  }>
  | Readonly<{
    kind: 'unassigned';
    fid: number | null;
    sceneKey: string;
  }>;

/**
 * The caller supplies an identity from authenticated Farcaster or current
 * server-verified PTR authority.
 * Usernames, display names, and profile pictures are intentionally ignored.
 * A distinct scene key makes an account switch discard the previous model.
 */
export function resolveMenuWarpletSelection(
  identity: Pick<VerifiedFarcasterIdentity, 'fid'> | null | undefined
): MenuWarpletSelection {
  if (!identity) {
    return {
      kind: 'showcase',
      guardianUrl: SHOWCASE_WARPLET_GUARDIAN_URL,
      sceneKey: 'anonymous-showcase'
    };
  }

  const fid = identity.fid;
  if (!Number.isSafeInteger(fid) || fid <= 0) {
    return { kind: 'unassigned', fid: null, sceneKey: 'verified-invalid-fid' };
  }

  const assigned = MENU_WARPLET_ASSIGNMENTS.find((entry) => entry.fid === fid);
  if (assigned) {
    return {
      kind: 'assigned',
      fid,
      guardianUrl: assigned.guardianUrl,
      sceneKey: `fid:${fid}:assigned`,
      provenance: assigned.provenance
    };
  }

  return { kind: 'unassigned', fid, sceneKey: `fid:${fid}:unassigned` };
}
