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

function orientedFootprintSeparation(
  left: (typeof INNER_KEEP_PRESENTATION_SLOTS)[number],
  right: (typeof INNER_KEEP_PRESENTATION_SLOTS)[number],
  halfExtents: readonly [number, number],
) {
  const leftRadians = left.rotationYMilliDegrees * Math.PI / 180_000;
  const rightRadians = right.rotationYMilliDegrees * Math.PI / 180_000;
  const axes = [leftRadians, rightRadians].flatMap((radians) => [
    [Math.cos(radians), Math.sin(radians)] as const,
    [-Math.sin(radians), Math.cos(radians)] as const,
  ]);
  const projectionRadius = (
    radians: number,
    axis: readonly [number, number],
  ) => (
    halfExtents[0] * Math.abs(
      Math.cos(radians) * axis[0] + Math.sin(radians) * axis[1],
    )
    + halfExtents[1] * Math.abs(
      -Math.sin(radians) * axis[0] + Math.cos(radians) * axis[1],
    )
  );
  const deltaX = right.positionMeters[0] - left.positionMeters[0];
  const deltaZ = right.positionMeters[2] - left.positionMeters[2];
  return Math.max(...axes.map((axis) => (
    Math.abs(deltaX * axis[0] + deltaZ * axis[1])
      - projectionRadius(leftRadians, axis)
      - projectionRadius(rightRadians, axis)
  )));
}

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

  it('pins the expanded slot transforms while preserving identity and activation policy', () => {
    expect(INNER_KEEP_PRESENTATION_SLOTS.map((slot) => ({
      slotId: slot.slotId,
      position: [slot.positionMeters[0], slot.positionMeters[2]],
    }))).toEqual([
      { slotId: 'inner-keep-slot-m01', position: [-9, -3.4] },
      { slotId: 'inner-keep-slot-m02', position: [-4.6, -6.8] },
      { slotId: 'inner-keep-slot-m03', position: [4.6, -6.8] },
      { slotId: 'inner-keep-slot-m04', position: [9, -3.4] },
      { slotId: 'inner-keep-slot-m05', position: [-9.1, 2.5] },
      { slotId: 'inner-keep-slot-m06', position: [-4.7, 6.9] },
      { slotId: 'inner-keep-slot-m07', position: [4.7, 6.9] },
      { slotId: 'inner-keep-slot-m08', position: [9.1, 2.5] },
      { slotId: 'inner-keep-slot-l01', position: [-13.7, -10.8] },
      { slotId: 'inner-keep-slot-l02', position: [13.7, -10.8] },
      { slotId: 'inner-keep-slot-l03', position: [-13.8, 10.6] },
      { slotId: 'inner-keep-slot-l04', position: [13.8, 10.6] },
    ]);
    expect(INNER_KEEP_PRESENTATION_SLOTS.map(({ active }) => active)).toEqual([
      true, true, true, true, true, true, true, true,
      false, false, false, false,
    ]);
  });

  it('builds one continuous expanded perimeter around at least 1,400 square meters', () => {
    const wall = INNER_KEEP_PRESENTATION_CLEARANCES.wall;
    expect((wall.eastX - wall.westX) * (wall.southZ - wall.northZ))
      .toBeGreaterThanOrEqual(1_400);

    const straight4 = INNER_KEEP_PRESENTATION_PLACEMENTS.find(
      ({ assetId }) => assetId === 'palisade-wall-straight-4m',
    )!.instances;
    const straight8 = INNER_KEEP_PRESENTATION_PLACEMENTS.find(
      ({ assetId }) => assetId === 'palisade-wall-straight-8m',
    )!.instances;
    const north = straight8.filter(({ positionMeters }) => positionMeters[2] === wall.northZ);
    expect(north.map(({ positionMeters }) => positionMeters[0])).toEqual([-16, -8, 0, 8, 16]);
    for (let index = 1; index < north.length; index += 1) {
      expect(north[index]!.positionMeters[0] - north[index - 1]!.positionMeters[0])
        .toBe(8);
    }
    for (const x of [wall.westX, wall.eastX]) {
      expect(straight8.filter(({ positionMeters }) => positionMeters[0] === x)
        .map(({ positionMeters }) => positionMeters[2]))
        .toEqual([-15, -7, 1, 9]);
    }
    expect(straight8.filter(({ positionMeters }) => positionMeters[2] === wall.southZ)
      .map(({ positionMeters }) => positionMeters[0]))
      .toEqual([-11, 11]);
    expect(straight4.filter(({ positionMeters }) => positionMeters[2] === wall.southZ)
      .map(({ positionMeters }) => positionMeters[0]))
      .toEqual([-5, 5, -17, 17]);
    expect(wall.southGateClearWidth).toBe(6);
  });

  it('keeps the largest Level-5 economy footprint clear in every active slot pair', () => {
    const largestTemplate = INNER_KEEP_PRESENTATION_PLACEMENTS
      .filter(({ anchor }) => anchor === 'active-medium-slot-template')
      .filter(({ collisionClearanceRole }) => collisionClearanceRole === 'slot-occupant')
      .map((placement) => placement.footprint.halfExtentsMeters!)
      .sort((left, right) => (
        Math.hypot(right[0], right[1]) - Math.hypot(left[0], left[1])
      ))[0]!;
    const levelFiveHalfExtents = Object.freeze([
      largestTemplate[0] * 1.1,
      largestTemplate[1] * 1.1,
    ] as const);
    const activeSlots = INNER_KEEP_PRESENTATION_SLOTS.filter(({ active }) => active);
    let minimumGap = Number.POSITIVE_INFINITY;
    for (let leftIndex = 0; leftIndex < activeSlots.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < activeSlots.length; rightIndex += 1) {
        minimumGap = Math.min(
          minimumGap,
          orientedFootprintSeparation(
            activeSlots[leftIndex]!,
            activeSlots[rightIndex]!,
            levelFiveHalfExtents,
          ),
        );
      }
    }
    expect(minimumGap).toBeGreaterThanOrEqual(0.2);
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
        positionMeters: [0, 0, -15.4],
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
        positionMeters: [-16, 0, 0],
        rotationMilliDegrees: [0, 0, 0],
        scalePermille: [380, 380, 380],
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
      'road-lamp-west <-> inner-keep-slot-m06',
    );
    expect(minimumObservedClearance).toBeCloseTo(0.274656, 9);
  });

  it('publishes exact clearance and camera contracts instead of renderer-only constants', () => {
    expect(INNER_KEEP_PRESENTATION_CLEARANCES).toEqual({
      units: 'meters',
      ground: {
        halfExtentsMeters: [24.2, 22],
        minimumLandmarkEdgeBuffer: 0.35,
      },
      slot: {
        mediumHalfExtents: [1.8, 1.55],
        largeReservedHalfExtents: [2.1, 2.1],
        minimumBetweenFootprints: 0.2,
        decorativeBuffer: 0.35,
      },
      road: {
        northSouthCenterX: 0,
        northSouthHalfWidth: 1.3,
        eastWestCenterZ: 0.2,
        eastWestHalfWidth: 1.075,
        requiredClearSideBuffer: 0.25,
      },
      wall: {
        westX: -20.2,
        eastX: 20.2,
        northZ: -21,
        southZ: 15,
        interiorClearance: 0.08,
        southGateClearWidth: 6,
      },
    });
    expect(INNER_KEEP_PRESENTATION_CAMERA_PRESETS).toMatchObject({
      projection: 'orthographic',
      positionMeters: [25, 29, 29],
      targetMeters: [0, 1, -3],
      near: 0.1,
      far: 120,
      minimumHalfWidth: 22,
      landscape: { minimumAspect: 0.78, baseHalfHeight: 19.6 },
      portrait: {
        maximumAspectExclusive: 0.78,
        baseHalfHeight: 26.4,
        positionMeters: [0, 31, 34],
        targetMeters: [0, 1, -3],
        initialZoomMultiplier: 0.9,
      },
      zoom: { minimum: 0.72, initial: 1, maximum: 1.5 },
      panBoundsMeters: { x: [-8, 8], z: [-9, 7] },
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
