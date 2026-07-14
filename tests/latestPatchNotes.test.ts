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
    expect(getLatestPatchNotes(packageJson.version)?.title).toBe('GENESIS 001 FOUNDING');
    expect(getLatestPatchNotes('0.0.0')).toBeUndefined();
    expect(getLatestPatchNotes('__proto__')).toBeUndefined();
  });

  it('prefers the open left side of the desktop menu and vertically centers the panel', () => {
    expect(calculatePatchNotesPosition({
      anchorLeft: 780,
      anchorTop: 420,
      anchorWidth: 180,
      anchorHeight: 44,
      panelWidth: 360,
      panelHeight: 280,
      viewportWidth: 1_024,
      viewportHeight: 768
    })).toEqual({
      left: 406,
      top: 302,
      placement: 'left'
    });
  });

  it('places the panel above a narrow-screen trigger and clamps it to viewport margins', () => {
    expect(calculatePatchNotesPosition({
      anchorLeft: 95,
      anchorTop: 690,
      anchorWidth: 200,
      anchorHeight: 44,
      panelWidth: 360,
      panelHeight: 300,
      viewportWidth: 390,
      viewportHeight: 844
    })).toEqual({
      left: 16,
      top: 376,
      placement: 'above'
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
      left: 16,
      top: 16,
      placement: 'left'
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
    })).toEqual({ left: 0, top: 0, placement: 'below' });
  });
});
