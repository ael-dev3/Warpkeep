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
import {
  INNER_KEEP_FREE_PLACEMENT_ENVELOPES,
  INNER_KEEP_FREE_PLACEMENT_POLICY,
  defaultInnerKeepPlacementTransform,
  evaluateInnerKeepPlacement,
  type InnerKeepFreePlacementBuildingKind,
  type InnerKeepOccupiedPlacement,
} from '../src/components/inner-keep/innerKeepFreePlacementPolicy';

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

  it('publishes zero fixed slots and covers all 38 selected assets across six families', () => {
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

    expect(CANONICAL_INNER_KEEP_SLOTS).toEqual([]);
    expect(INNER_KEEP_PRESENTATION_SLOTS).toEqual([]);
    for (const placement of INNER_KEEP_PRESENTATION_PLACEMENTS) {
      expect(placement.instances.length).toBeGreaterThan(0);
      expect(placement.qualityAvailability).toEqual(['high', 'balanced', 'compact']);
      expect(placement.footprint.clearanceMarginMeters).toBeGreaterThanOrEqual(0);
      expect(placement.slotIds).toEqual([]);
      for (const instance of placement.instances) {
        expect(instance.positionMeters.every(Number.isFinite)).toBe(true);
        expect(instance.rotationMilliDegrees.every(Number.isSafeInteger)).toBe(true);
        expect(instance.scalePermille.every((value) => (
          Number.isSafeInteger(value) && value > 0
        ))).toBe(true);
      }
    }
  });

  it('pins the 96 by 80 metre free-placement support and six native envelopes', () => {
    expect(INNER_KEEP_FREE_PLACEMENT_POLICY).toMatchObject({
      compound: { widthMeters: 96, depthMeters: 80, centerZMeters: -4 },
      supportBoundsMicrounits: {
        minimumX: -44_000_000n,
        maximumX: 44_000_000n,
        minimumZ: -40_000_000n,
        maximumZ: 32_000_000n,
      },
      snapIncrementMicrounits: 500_000n,
      rotationsMilliDegrees: [0, 90_000, 180_000, 270_000],
    });
    expect(Object.fromEntries(Object.entries(INNER_KEEP_FREE_PLACEMENT_ENVELOPES)
      .map(([kind, envelope]) => [kind, envelope.halfExtentsMeters])))
      .toEqual({
        'city-mill': [5.65, 4.75],
        'lumber-camp': [5.3, 4.4],
        'city-stoneworks': [5.5, 4.6],
        'city-goldworks': [5.5, 4.6],
        'city-barracks': [9.25, 7.75],
        'grand-covenant-cathedral': [18.5, 16.01],
      });
  });

  it('builds one continuous native-scale perimeter around 7,680 square meters', () => {
    const wall = INNER_KEEP_PRESENTATION_CLEARANCES.wall;
    expect((wall.eastX - wall.westX) * (wall.southZ - wall.northZ))
      .toBe(7_680);

    const straight4 = INNER_KEEP_PRESENTATION_PLACEMENTS.find(
      ({ assetId }) => assetId === 'palisade-wall-straight-4m',
    )!.instances;
    const straight8 = INNER_KEEP_PRESENTATION_PLACEMENTS.find(
      ({ assetId }) => assetId === 'palisade-wall-straight-8m',
    )!.instances;
    const north = straight8.filter(({ positionMeters }) => positionMeters[2] === wall.northZ);
    expect(north.map(({ positionMeters }) => positionMeters[0])).toEqual([
      -44, -36, -28, -20, -12, -4, 4, 12, 20, 28, 36, 44,
    ]);
    for (let index = 1; index < north.length; index += 1) {
      expect(north[index]!.positionMeters[0] - north[index - 1]!.positionMeters[0])
        .toBe(8);
    }
    for (const x of [wall.westX, wall.eastX]) {
      expect(straight8.filter(({ positionMeters }) => positionMeters[0] === x)
        .map(({ positionMeters }) => positionMeters[2]))
        .toEqual([-40, -32, -24, -16, -8, 0, 8, 16, 24, 32]);
    }
    expect(straight8.filter(({ positionMeters }) => positionMeters[2] === wall.southZ)
      .map(({ positionMeters }) => positionMeters[0]))
      .toEqual([-44, -36, -28, -20, -12, 12, 20, 28, 36, 44]);
    expect(straight4.filter(({ positionMeters }) => positionMeters[2] === wall.southZ)
      .map(({ positionMeters }) => positionMeters[0]))
      .toEqual([-6, 6]);
    expect(wall.southGateClearWidth).toBe(6);
  });

  it('finds a deterministic valid native-scale transform for all six outcomes', () => {
    const occupied: InnerKeepOccupiedPlacement[] = [];
    for (const buildingKind of Object.keys(
      INNER_KEEP_FREE_PLACEMENT_ENVELOPES,
    ) as InnerKeepFreePlacementBuildingKind[]) {
      const transform = defaultInnerKeepPlacementTransform(buildingKind, occupied);
      expect(transform, buildingKind).not.toBeNull();
      expect(evaluateInnerKeepPlacement(
        buildingKind,
        transform!,
        occupied,
      ), buildingKind).toMatchObject({ valid: true, reason: null });
      occupied.push(Object.freeze({
        buildingKey: `test:${buildingKind}`,
        buildingKind,
        ...transform!,
      }));
    }
    expect(occupied).toHaveLength(6);
  });

  it('keeps Cathedral and Barracks unbuilt as native-scale project templates', () => {
    for (const assetId of ['grand-covenant-cathedral', 'city-barracks']) {
      const placement = INNER_KEEP_PRESENTATION_PLACEMENTS.find(
        (entry) => entry.assetId === assetId,
      );
      expect(placement).toMatchObject({
        anchor: 'free-placement-template',
        collisionClearanceRole: 'constructible-outcome',
        pickingRole: 'none',
        instances: [{
          placementId: `${assetId}:free-placement-template`,
          positionMeters: [0, 0, 0],
          rotationMilliDegrees: [0, 0, 0],
          scalePermille: [1_000, 1_000, 1_000],
        }],
      });
    }
  });

  it('keeps the initial authored scene free of all constructible outcomes', () => {
    const constructibleIds = new Set(Object.keys(INNER_KEEP_FREE_PLACEMENT_ENVELOPES));
    expect(INNER_KEEP_PRESENTATION_PLACEMENTS.filter(({ assetId, anchor }) => (
      constructibleIds.has(assetId) && anchor === 'fixed'
    ))).toEqual([]);
    expect(INNER_KEEP_PRESENTATION_PLACEMENTS.filter(({ anchor }) => (
      anchor === 'free-placement-template'
    ))).toHaveLength(6);
  });

  it('publishes exact clearance and camera contracts instead of renderer-only constants', () => {
    expect(INNER_KEEP_PRESENTATION_CLEARANCES).toEqual({
      units: 'meters',
      ground: {
        halfExtentsMeters: [72, 72],
        minimumFixedSceneryEdgeBuffer: 0.35,
      },
      freePlacement: {
        minimumX: -44,
        maximumX: 44,
        minimumZ: -40,
        maximumZ: 32,
        snapIncrementMeters: 0.5,
        rotationsMilliDegrees: [0, 90_000, 180_000, 270_000],
        wallInteriorSetbackMeters: 4,
      },
      road: {
        northSouthCenterX: 0,
        northSouthHalfWidth: 2,
        minimumZ: -3,
        maximumZ: 32,
        requiredClearSideBuffer: 1,
        commonsCenter: [0, 2],
        commonsHalfExtents: [5, 5],
      },
      wall: {
        westX: -48,
        eastX: 48,
        northZ: -44,
        southZ: 36,
        interiorClearance: 4,
        southGateClearWidth: 6,
        southGateVisualClearWidth: 4.82,
      },
    });
    expect(INNER_KEEP_PRESENTATION_CAMERA_PRESETS).toMatchObject({
      projection: 'orthographic',
      positionMeters: [68, 82, 78],
      targetMeters: [0, 1, -4],
      near: 0.1,
      far: 300,
      minimumHalfWidth: 64,
      landscape: { minimumAspect: 0.78, baseHalfHeight: 48 },
      portrait: {
        maximumAspectExclusive: 0.78,
        baseHalfHeight: 72,
        positionMeters: [0, 112, 72],
        targetMeters: [0, 1, -4],
        initialZoomMultiplier: 1,
      },
      zoom: { minimum: 0.8, initial: 1, maximum: 2 },
      panBoundsMeters: { x: [-9, 9], z: [-9, 9] },
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
