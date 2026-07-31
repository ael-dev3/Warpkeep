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
      releasedOn: '31 JUL 2026',
      title: 'THE REALM IN HAND'
    });
    expect(getLatestPatchNotes(packageJson.version)?.highlights.join(' ')).toMatch(
      /compact portrait rail.*keeper portrait.*four resources.*safe areas/i
    );
    expect(getLatestPatchNotes(packageJson.version)?.highlights.join(' ')).toMatch(
      /Keeps.*Workers.*resources.*Water.*terrain.*Explore.*Settings.*Back/i
    );
    expect(getLatestPatchNotes(packageJson.version)?.highlights.join(' ')).toMatch(
      /server-validated Quick Auth.*memory-only.*browser sign-in.*SIWF/i
    );
    expect(getLatestPatchNotes(packageJson.version)?.highlights.join(' ')).not.toMatch(
      /released to players|deployed to players|public balances|guaranteed rewards/i
    );
    expect(getLatestPatchNotes(packageJson.version)?.summary).toContain('Farcaster');
    expect(getLatestPatchNotes(packageJson.version)?.alphaNotice).toContain('unfinished');
    expect(getLatestPatchNotes(packageJson.version)?.alphaNotice).toContain(
      'not admission; it creates no castle and changes no ownership, balance, Worker authority, terrain, or persistent world rule'
    );

    const alpha0324 = getLatestPatchNotes('0.3.24');
    expect(alpha0324).toMatchObject({
      releasedOn: '29 JUL 2026',
      title: 'WAGONS TAKE THE ROAD'
    });
    expect(alpha0324?.highlights.join(' ')).toMatch(
      /Horse gait.*distance-driven wheel rotation.*actual route speed.*terrain contact/i
    );
    expect(alpha0324?.alphaNotice).toContain(
      'does not change authentication, Worker authority, routes'
    );

    expect(getLatestPatchNotes('0.3.26')).toMatchObject({
      title: 'THE NORTHERN REACH'
    });
    expect(getLatestPatchNotes('0.3.25')).toMatchObject({
      title: 'THE LIVING REALM'
    });
    const alpha0322 = getLatestPatchNotes('0.3.22');
    expect(alpha0322).toMatchObject({
      title: 'THE WAGONS REST'
    });
    expect(`${alpha0322?.summary} ${alpha0322?.highlights.join(' ')}`).toMatch(
      /early gateway-alignment pass.*fuller correction.*initial title-transition alignment pass.*production evidence.*could still disagree/i
    );
    expect(`${alpha0322?.summary} ${alpha0322?.highlights.join(' ')}`).not.toMatch(
      /holds beneath.*remain centered.*instead of drifting/i
    );
    expect(getLatestPatchNotes('0.3.15')).toBeUndefined();
    expect(getLatestPatchNotes('0.3.14')).toBeUndefined();
    expect(getLatestPatchNotes('0.3.13')).toBeUndefined();
    expect(getLatestPatchNotes('0.3.12')).toBeUndefined();
    expect(getLatestPatchNotes('0.3.8')).toBeUndefined();
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
