import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { calculatePatchNotesPosition } from '../src/components/menu/LatestPatchNotesPopover';
import {
  getLatestPatchNotes,
  WARPKEEP_PATCH_NOTES_BY_VERSION
} from '../src/components/menu/latestPatchNotes';

describe('latest in-menu patch notes', () => {
  it('ships exact notes for the package product version without falling back to stale content', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
    ) as { version: string };

    expect(Object.keys(WARPKEEP_PATCH_NOTES_BY_VERSION)).toContain(packageJson.version);
    expect(getLatestPatchNotes(packageJson.version)).toMatchObject({
      releasedOn: 'CANDIDATE · 18 JUL 2026',
      title: 'GENESIS WOOD EXPEDITIONS'
    });
    expect(getLatestPatchNotes(packageJson.version)?.highlights.join(' ')).toMatch(
      /10,000 persistent cells.*2,000 resource-capable anchors.*twenty-four Gold Mines.*ninety-six Wheat Farms.*preserved founder slots.*shared Lowlands forest layout/i
    );
    expect(getLatestPatchNotes(packageJson.version)?.highlights.join(' ')).toMatch(
      /Ninety-six deterministic Tier-I Logging Camps.*passable forest resource-capable anchors.*placement digest.*Gold\/Food\/forest\/castle\/corridor clearance.*catalog identical for every player/i
    );
    expect(getLatestPatchNotes(packageJson.version)?.highlights.join(' ')).toMatch(
      /Wood dispatch.*site id.*idempotency key.*server derives.*one-Wood-wagon limit.*1 Wood\/minute.*30-day gathering window.*browser never moves a wagon or credits Wood/i
    );
    expect(getLatestPatchNotes(packageJson.version)?.highlights.join(' ')).toMatch(
      /Gold, Food, and Wood.*separate private expedition loops.*one wagon of each kind.*Public occupation.*site.*phase.*server timeline.*origin castle.*FIDs.*request keys.*routes.*accrued output.*balances stay private/i
    );
    expect(getLatestPatchNotes(packageJson.version)?.highlights.join(' ')).toMatch(
      /Food and Wood each reserve.*remaining 30-day award.*passive terrain output.*shared server-side settlement path.*collection.*every lifecycle schedule.*late delivery.*truncating, duplicating, or stranding either award/i
    );
    expect(getLatestPatchNotes(packageJson.version)?.highlights.join(' ')).toMatch(
      /Logging Camps.*provenance-pinned High, Balanced, and Compact models.*bounded shared node rendering.*nearby-only wagon presentation.*safe marker fallback.*never supplies placement or gameplay authority/i
    );
    expect(getLatestPatchNotes(packageJson.version)?.highlights.join(' ')).toMatch(
      /provenance-pinned transparent Logging Camp record illustration.*Wood inspection card.*local, pointer-inert decoration.*never supplies map, balance, gathering, or reward authority/i
    );
    expect(getLatestPatchNotes(packageJson.version)?.highlights.join(' ')).toMatch(
      /Community Marks remains a separate private authority.*no conversion.*transfer.*credit.*spending.*Construction.*combat.*trading.*public inventories.*financial rewards remain unavailable/i
    );
    expect(getLatestPatchNotes(packageJson.version)?.highlights.join(' ')).not.toMatch(
      /released to players|deployed to players|public balances|guaranteed rewards/i
    );
    expect(getLatestPatchNotes(packageJson.version)?.summary).toContain('undeployed candidate');
    expect(getLatestPatchNotes(packageJson.version)?.alphaNotice).toContain(
      'additive module publication'
    );
    expect(getLatestPatchNotes(packageJson.version)?.alphaNotice).toContain(
      'owner-approved resource, Gold-site, forest-layout, Food-site, and Wood-site setup'
    );
    expect(getLatestPatchNotes(packageJson.version)?.alphaNotice).toContain(
      'aggregate verification'
    );
    expect(getLatestPatchNotes(packageJson.version)?.alphaNotice).toContain(
      'exact Pages deployment'
    );
    expect(getLatestPatchNotes('0.3.9')?.title).toBe('GENESIS GOLD EXPEDITIONS');
    expect(getLatestPatchNotes('0.3.8')?.title).toBe('GENESIS WORLD EXPANSION');
    expect(getLatestPatchNotes('0.3.7')?.title).toBe('GENESIS RESOURCE AUTHORITY');
    expect(getLatestPatchNotes('0.3.6')?.title).toBe('REALM READABILITY & STABILITY');
    expect(getLatestPatchNotes('0.3.5')?.title).toBe('GAME-READY CASTLE REFRESH');
    expect(getLatestPatchNotes('0.3.4')?.title).toBe('REALM QUALITY FOLLOW-THROUGH');
    expect(getLatestPatchNotes('0.3.3')?.title).toBe('GENESIS REALM QUALITY');
    expect(getLatestPatchNotes('0.3.2')?.title).toBe('GENESIS 001 FOUNDING');
    expect(getLatestPatchNotes('0.0.0')).toBeUndefined();
    expect(getLatestPatchNotes('__proto__')).toBeUndefined();
  });

  it('places the panel above the bottom-left desktop build stamp and aligns its arrow', () => {
    expect(calculatePatchNotesPosition({
      anchorLeft: 16,
      anchorTop: 660,
      anchorWidth: 110,
      anchorHeight: 44,
      panelWidth: 400,
      panelHeight: 320,
      viewportWidth: 1_280,
      viewportHeight: 720
    })).toEqual({
      arrowOffset: 55,
      left: 16,
      top: 326,
      placement: 'above'
    });
  });

  it('places the panel above the bottom-right portrait stamp and aligns after clamping', () => {
    expect(calculatePatchNotesPosition({
      anchorLeft: 230,
      anchorTop: 780,
      anchorWidth: 144,
      anchorHeight: 44,
      panelWidth: 360,
      panelHeight: 300,
      viewportWidth: 390,
      viewportHeight: 844
    })).toEqual({
      arrowOffset: 286,
      left: 16,
      top: 466,
      placement: 'above'
    });
  });

  it('keeps compact 320x568 portrait and 568x320 landscape placements bounded', () => {
    expect(calculatePatchNotesPosition({
      anchorLeft: 172,
      anchorTop: 512,
      anchorWidth: 78,
      anchorHeight: 44,
      panelWidth: 288,
      panelHeight: 480,
      viewportWidth: 320,
      viewportHeight: 568
    })).toEqual({
      arrowOffset: 195,
      left: 16,
      top: 18,
      placement: 'above'
    });

    expect(calculatePatchNotesPosition({
      anchorLeft: 12,
      anchorTop: 266,
      anchorWidth: 90,
      anchorHeight: 44,
      panelWidth: 400,
      panelHeight: 288,
      viewportWidth: 568,
      viewportHeight: 320
    })).toEqual({
      arrowOffset: 268,
      left: 116,
      top: 16,
      placement: 'right'
    });
  });

  it('fails into bounded coordinates for malformed or tiny viewport measurements', () => {
    expect(calculatePatchNotesPosition({
      anchorLeft: Number.NaN,
      anchorTop: Number.POSITIVE_INFINITY,
      anchorWidth: -4,
      anchorHeight: -8,
      panelWidth: 500,
      panelHeight: 500,
      viewportWidth: 120,
      viewportHeight: 80
    })).toEqual({
      arrowOffset: 24,
      left: 16,
      top: 16,
      placement: 'right'
    });
    expect(calculatePatchNotesPosition({
      anchorLeft: 0,
      anchorTop: 0,
      anchorWidth: 0,
      anchorHeight: 0,
      panelWidth: 0,
      panelHeight: 0,
      viewportWidth: 0,
      viewportHeight: 0
    })).toEqual({ arrowOffset: 0, left: 0, top: 0, placement: 'below' });
  });
});
