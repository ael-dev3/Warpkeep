import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  INNER_KEEP_ASSET_SELECTION,
  INNER_KEEP_SELECTED_ASSETS,
} from '../scripts/inner-keep-runtime-asset-contract.mjs';
import {
  CANONICAL_INNER_KEEP_LAYOUT,
  CANONICAL_INNER_KEEP_SLOTS,
  INNER_KEEP_LAYOUT_DIGEST,
  INNER_KEEP_PRESENTATION_LAYOUT_DIGEST as SERVER_INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
  canonicalInnerKeepLayoutDigestInput,
} from '../spacetimedb/src/innerKeepLayoutPolicy';
import {
  CANONICAL_INNER_KEEP_PRESENTATION_LAYOUT,
  INNER_KEEP_PRESENTATION_ASSETS,
  INNER_KEEP_PRESENTATION_ASSET_SELECTION_DIGEST,
  INNER_KEEP_PRESENTATION_ASSET_USE_STATUS,
  INNER_KEEP_PRESENTATION_CAMERA_PRESETS,
  INNER_KEEP_PRESENTATION_CLEARANCES,
  INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
  INNER_KEEP_PRESENTATION_PLACEMENTS,
  INNER_KEEP_PRESENTATION_SLOTS,
  canonicalInnerKeepPresentationLayoutDigestInput,
} from '../src/components/inner-keep/innerKeepPresentationLayoutPolicy';

const ROOT = resolve(import.meta.dirname, '..');

describe('Inner Keep deterministic presentation layout manifest', () => {
  it('pins every selected asset ID, source ID, bound, quality, and immutable path', () => {
    expect(INNER_KEEP_PRESENTATION_ASSET_SELECTION_DIGEST).toBe(
      INNER_KEEP_ASSET_SELECTION.selectionDigestSha256,
    );
    expect(INNER_KEEP_PRESENTATION_ASSETS).toHaveLength(36);
    expect(INNER_KEEP_PRESENTATION_ASSETS.map((asset) => asset.assetId)).toEqual(
      INNER_KEEP_SELECTED_ASSETS.map((asset) => asset.id),
    );

    for (const asset of INNER_KEEP_PRESENTATION_ASSETS) {
      const selected = INNER_KEEP_SELECTED_ASSETS.find((entry) => entry.id === asset.assetId);
      expect(selected).toBeDefined();
      expect(asset.sourceAssetId).toBe(selected?.sourceAssetId);
      expect(asset.family).toBe(selected?.family);
      expect(asset.boundsMeters).toEqual(selected?.boundsMeters);
      expect(asset.qualityAvailability).toEqual(['high', 'balanced', 'compact']);
      expect(asset.runtimePaths).toEqual(Object.fromEntries(
        selected!.models.map((model: { profile: string; destinationPath: string }) => [
          model.profile,
          model.destinationPath,
        ]),
      ));
      for (const path of Object.values(asset.runtimePaths)) {
        expect(path).toMatch(
          /^public\/models\/hegemony\/inner-keep\/.+-[a-f0-9]{16}\.glb$/u,
        );
        expect(existsSync(resolve(ROOT, path)), path).toBe(false);
      }
    }
  });

  it('keeps planned paths unavailable until the separate owner-use gate changes', () => {
    expect(INNER_KEEP_PRESENTATION_ASSET_USE_STATUS).toBe(
      'planned-only-pending-owner-runtime-use-authorization',
    );
    expect(INNER_KEEP_ASSET_SELECTION.authorization).toMatchObject({
      officialRepositoryRuntimeUseAuthorized: false,
      status: 'pending-owner-runtime-use-authorization',
    });
  });

  it('covers all twelve authoritative slots and 36 selected assets across five families', () => {
    expect(INNER_KEEP_PRESENTATION_SLOTS).toEqual(CANONICAL_INNER_KEEP_SLOTS.map((slot) => ({
      slotId: slot.slotId,
      footprintClass: slot.footprintClass,
      positionMeters: [
        Number(slot.localXMicrounits) / 1_000_000,
        0,
        Number(slot.localZMicrounits) / 1_000_000,
      ],
      rotationYMilliDegrees: slot.rotationMilliDegrees,
      active: slot.active,
    })));
    expect(INNER_KEEP_PRESENTATION_PLACEMENTS).toHaveLength(36);
    expect(new Set(INNER_KEEP_PRESENTATION_ASSETS.map((entry) => entry.family)).size).toBe(5);
    expect(new Set(INNER_KEEP_PRESENTATION_PLACEMENTS.map((entry) => entry.assetId))).toEqual(
      new Set(INNER_KEEP_PRESENTATION_ASSETS.map((entry) => entry.assetId)),
    );

    const activeSlotIds = CANONICAL_INNER_KEEP_SLOTS
      .filter((slot) => slot.active)
      .map((slot) => slot.slotId);
    for (const placement of INNER_KEEP_PRESENTATION_PLACEMENTS) {
      expect(placement.instances.length).toBeGreaterThan(0);
      expect(placement.qualityAvailability).toEqual(['high', 'balanced', 'compact']);
      expect(placement.footprint.clearanceMarginMeters).toBeGreaterThanOrEqual(0);
      if (placement.anchor === 'active-medium-slot-template') {
        expect(placement.slotIds).toEqual(activeSlotIds);
      } else {
        expect(placement.slotIds).toEqual([]);
      }
      for (const instance of placement.instances) {
        expect(instance.positionMeters.every(Number.isFinite)).toBe(true);
        expect(instance.rotationMilliDegrees.every(Number.isSafeInteger)).toBe(true);
        expect(instance.scalePermille.every((value) => (
          Number.isSafeInteger(value) && value > 0
        ))).toBe(true);
      }
    }
  });

  it('publishes exact clearance and camera contracts instead of renderer-only constants', () => {
    expect(INNER_KEEP_PRESENTATION_CLEARANCES).toEqual({
      units: 'meters',
      slot: {
        mediumHalfExtents: [1.5, 1.3],
        largeReservedHalfExtents: [1.5, 1.5],
        minimumBetweenFootprints: 0.2,
        decorativeBuffer: 0.25,
      },
      road: {
        northSouthCenterX: 0,
        northSouthHalfWidth: 1.3,
        eastWestCenterZ: 0.2,
        eastWestHalfWidth: 1.075,
        requiredClearSideBuffer: 0.25,
      },
      wall: {
        westX: -12,
        eastX: 12,
        northZ: -9.5,
        southZ: 9.5,
        interiorClearance: 0.08,
        southGateClearWidth: 5.4,
      },
    });
    expect(INNER_KEEP_PRESENTATION_CAMERA_PRESETS).toMatchObject({
      projection: 'orthographic',
      positionMeters: [17, 21, 19],
      targetMeters: [0, 0.5, 0],
      near: 0.1,
      far: 100,
      minimumHalfWidth: 12.8,
      landscape: { minimumAspect: 0.78, baseHalfHeight: 11.8 },
      portrait: { maximumAspectExclusive: 0.78, baseHalfHeight: 16.5 },
      zoom: { minimum: 0.72, initial: 1, maximum: 1.5 },
      panBoundsMeters: { x: [-3.4, 3.4], z: [-2.8, 2.8] },
    });
  });

  it('binds presentation drift into the client/server authority layout digest', () => {
    expect(createHash('sha256')
      .update(canonicalInnerKeepPresentationLayoutDigestInput())
      .digest('hex')).toBe(INNER_KEEP_PRESENTATION_LAYOUT_DIGEST);
    expect(SERVER_INNER_KEEP_PRESENTATION_LAYOUT_DIGEST).toBe(
      INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
    );
    expect(createHash('sha256')
      .update(canonicalInnerKeepLayoutDigestInput())
      .digest('hex')).toBe(INNER_KEEP_LAYOUT_DIGEST);
    expect(canonicalInnerKeepLayoutDigestInput()).toContain(
      INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
    );
    expect(CANONICAL_INNER_KEEP_LAYOUT.layoutDigest).toBe(INNER_KEEP_LAYOUT_DIGEST);
    expect(CANONICAL_INNER_KEEP_PRESENTATION_LAYOUT).toMatchObject({
      layoutId: CANONICAL_INNER_KEEP_LAYOUT.layoutId,
      layoutVersion: CANONICAL_INNER_KEEP_LAYOUT.layoutVersion,
      digest: INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
    });
  });
});
