import { describe, expect, it } from 'vitest';

import type { VerifiedFarcasterIdentity } from '../src/farcaster/farcasterAuthTypes';
import {
  MENU_WARPLET_ASSIGNMENTS,
  SHOWCASE_WARPLET_GUARDIAN_URL,
  resolveMenuWarpletSelection
} from '../src/components/menu/menuWarpletRegistry';

function verifiedIdentity(
  fid: number,
  display: Partial<Pick<VerifiedFarcasterIdentity, 'username' | 'displayName'>> = {}
): VerifiedFarcasterIdentity {
  return {
    fid,
    verifiedAt: 1,
    verifications: [],
    ...display
  };
}

describe('menu Warplet registry', () => {
  it('shows the castle guardian to anonymous visitors as an unassigned showcase', () => {
    expect(resolveMenuWarpletSelection(null)).toEqual({
      kind: 'showcase',
      guardianUrl: SHOWCASE_WARPLET_GUARDIAN_URL,
      sceneKey: 'anonymous-showcase'
    });
  });

  it('assigns the owner guardian only to verified numeric FID 539854', () => {
    const selection = resolveMenuWarpletSelection(
      verifiedIdentity(539854, { username: 'renamed-account', displayName: 'Any display name' })
    );
    expect(selection.kind).toBe('assigned');
    if (selection.kind !== 'assigned') return;
    expect(selection.guardianUrl).toBe(SHOWCASE_WARPLET_GUARDIAN_URL);
    expect(selection.sceneKey).toBe('fid:539854:assigned');
    expect(selection.provenance.sourceUrl).toContain('user-by-username');
  });

  it('never gives the owner model to another verified FID, even with a matching handle', () => {
    const other = resolveMenuWarpletSelection(
      verifiedIdentity(732419, { username: '0xael.eth', displayName: 'Ael' })
    );
    expect(other).toEqual({
      kind: 'unassigned',
      fid: 732419,
      sceneKey: 'fid:732419:unassigned'
    });
    expect('guardianUrl' in other).toBe(false);
  });

  it('changes the scene key on account switch so the previous guardian is discarded', () => {
    const owner = resolveMenuWarpletSelection(verifiedIdentity(539854));
    const other = resolveMenuWarpletSelection(verifiedIdentity(732419));
    const anonymous = resolveMenuWarpletSelection(undefined);

    expect(owner.sceneKey).not.toBe(other.sceneKey);
    expect(other.sceneKey).not.toBe(anonymous.sceneKey);
    expect('guardianUrl' in other).toBe(false);
  });

  it('fails closed on an invalid FID and keeps registry entries auditable', () => {
    expect(resolveMenuWarpletSelection(verifiedIdentity(Number.NaN))).toEqual({
      kind: 'unassigned',
      fid: null,
      sceneKey: 'verified-invalid-fid'
    });
    expect(new Set(MENU_WARPLET_ASSIGNMENTS.map((entry) => entry.fid)).size)
      .toBe(MENU_WARPLET_ASSIGNMENTS.length);
    for (const entry of MENU_WARPLET_ASSIGNMENTS) {
      expect(entry.guardianUrl).toMatch(/^models\/menu\/[a-z0-9-]+\.glb$/);
      expect(entry.provenance.sourceUrl).toMatch(/^https:\/\//);
      expect(entry.provenance.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
