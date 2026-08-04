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
    expect(INNER_KEEP_PRESENTATION_ASSETS).toHaveLength(38);
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
        expect(existsSync(resolve(ROOT, path)), path).toBe(true);
      }
    }
  });

  it('binds installed paths to the exact owner-authorized runtime-use record', () => {
    expect(INNER_KEEP_PRESENTATION_ASSET_USE_STATUS).toBe(
      'authorized-owner-runtime-use',
    );
    expect(INNER_KEEP_ASSET_SELECTION.authorization).toMatchObject({
      officialRepositoryRuntimeUseAuthorized: true,
      status: 'authorized-owner-runtime-use',
      recordedAt: '2026-08-04',
    });
    expect(INNER_KEEP_ASSET_SELECTION.authorization.scopeBoundary).toMatch(
      /does not relicense.*approve activation.*approve merge/iu,
    );
  });

  it('covers all twelve authoritative slots and 38 selected assets across six families', () => {
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
    expect(INNER_KEEP_PRESENTATION_PLACEMENTS).toHaveLength(38);
    expect(new Set(INNER_KEEP_PRESENTATION_ASSETS.map((entry) => entry.family)).size).toBe(6);
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

  it('makes the Cathedral the northern visual anchor and Barracks the western garrison', () => {
    expect(INNER_KEEP_PRESENTATION_PLACEMENTS.find(
      (entry) => entry.assetId === 'grand-covenant-cathedral',
    )).toMatchObject({
      anchor: 'fixed',
      collisionClearanceRole: 'primary-civic-anchor',
      pickingRole: 'none',
      instances: [{
        placementId: 'grand-covenant-cathedral-main-building',
        positionMeters: [0, 0, -11.8],
        rotationMilliDegrees: [0, 0, 0],
        scalePermille: [300, 300, 300],
      }],
    });
    expect(INNER_KEEP_PRESENTATION_PLACEMENTS.find(
      (entry) => entry.assetId === 'city-barracks',
    )).toMatchObject({
      anchor: 'fixed',
      collisionClearanceRole: 'garrison-anchor',
      pickingRole: 'none',
      instances: [{
        placementId: 'shieldcourt-barracks-west-garrison',
        positionMeters: [-12.7, 0, -0.4],
        rotationMilliDegrees: [0, 0, 0],
        scalePermille: [360, 360, 360],
      }],
    });
  });

  it('keeps every transformed fixed non-road AABB clear of every reserved slot', () => {
    const assetById = new Map(INNER_KEEP_PRESENTATION_ASSETS.map((asset) => (
      [asset.assetId, asset] as const
    )));
    let minimumObservedClearance = Number.POSITIVE_INFINITY;
    let minimumObservedPair = '';

    for (const placement of INNER_KEEP_PRESENTATION_PLACEMENTS) {
      if (placement.anchor !== 'fixed' || placement.collisionClearanceRole === 'road-surface') {
        continue;
      }
      const asset = assetById.get(placement.assetId)!;
      for (const instance of placement.instances) {
        const radians = instance.rotationMilliDegrees[1] / 1_000 * Math.PI / 180;
        const cosine = Math.abs(Math.cos(radians));
        const sine = Math.abs(Math.sin(radians));
        const unrotatedHalfX = asset.boundsMeters[0] * instance.scalePermille[0] / 2_000;
        const unrotatedHalfZ = asset.boundsMeters[2] * instance.scalePermille[2] / 2_000;
        const placementHalfX = cosine * unrotatedHalfX
          + sine * unrotatedHalfZ
          + placement.footprint.clearanceMarginMeters;
        const placementHalfZ = sine * unrotatedHalfX
          + cosine * unrotatedHalfZ
          + placement.footprint.clearanceMarginMeters;

        for (const slot of INNER_KEEP_PRESENTATION_SLOTS) {
          const slotHalfExtents = slot.footprintClass === 'large'
            ? INNER_KEEP_PRESENTATION_CLEARANCES.slot.largeReservedHalfExtents
            : INNER_KEEP_PRESENTATION_CLEARANCES.slot.mediumHalfExtents;
          const slotHalfX = slotHalfExtents[0]
            + INNER_KEEP_PRESENTATION_CLEARANCES.slot.decorativeBuffer;
          const slotHalfZ = slotHalfExtents[1]
            + INNER_KEEP_PRESENTATION_CLEARANCES.slot.decorativeBuffer;
          const separationX = Math.abs(
            instance.positionMeters[0] - slot.positionMeters[0],
          ) - placementHalfX - slotHalfX;
          const separationZ = Math.abs(
            instance.positionMeters[2] - slot.positionMeters[2],
          ) - placementHalfZ - slotHalfZ;
          const clearance = Math.hypot(
            Math.max(0, separationX),
            Math.max(0, separationZ),
          );
          const pair = `${instance.placementId} <-> ${slot.slotId}`;
          if (clearance < minimumObservedClearance) {
            minimumObservedClearance = clearance;
            minimumObservedPair = pair;
          }
          expect(clearance, pair).toBeGreaterThanOrEqual(
            INNER_KEEP_PRESENTATION_CLEARANCES.slot.minimumBetweenFootprints,
          );
        }
      }
    }

    expect(minimumObservedPair).toBe(
      'north-collapsed-arch <-> inner-keep-slot-m02',
    );
    expect(minimumObservedClearance).toBeCloseTo(0.2276579117, 9);
  });

  it('publishes exact clearance and camera contracts instead of renderer-only constants', () => {
    expect(INNER_KEEP_PRESENTATION_CLEARANCES).toEqual({
      units: 'meters',
      ground: {
        halfExtentsMeters: [18.5, 18],
        minimumLandmarkEdgeBuffer: 0.35,
      },
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
        westX: -16.2,
        eastX: 16.2,
        northZ: -17,
        southZ: 10.5,
        interiorClearance: 0.08,
        southGateClearWidth: 6,
      },
    });
    expect(INNER_KEEP_PRESENTATION_CAMERA_PRESETS).toMatchObject({
      projection: 'orthographic',
      positionMeters: [21, 25, 24],
      targetMeters: [0, 1, -2.5],
      near: 0.1,
      far: 120,
      minimumHalfWidth: 17.4,
      landscape: { minimumAspect: 0.78, baseHalfHeight: 16.8 },
      portrait: {
        maximumAspectExclusive: 0.78,
        baseHalfHeight: 22.2,
        positionMeters: [0, 27, 30],
        targetMeters: [0, 1, -2.5],
        initialZoomMultiplier: 0.9,
      },
      zoom: { minimum: 0.72, initial: 1, maximum: 1.5 },
      panBoundsMeters: { x: [-4, 4], z: [-4, 3] },
    });
    const portraitInitialZoom = INNER_KEEP_PRESENTATION_CAMERA_PRESETS.zoom.initial
      * INNER_KEEP_PRESENTATION_CAMERA_PRESETS.portrait.initialZoomMultiplier;
    expect(portraitInitialZoom).toBeGreaterThanOrEqual(
      INNER_KEEP_PRESENTATION_CAMERA_PRESETS.zoom.minimum,
    );
    expect(portraitInitialZoom).toBeLessThanOrEqual(1);
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
