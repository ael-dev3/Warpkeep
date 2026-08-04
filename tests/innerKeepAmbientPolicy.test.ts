import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  INNER_KEEP_AMBIENT_ACTOR_CATALOG,
  INNER_KEEP_AMBIENT_AUTHORITY_BOUNDARY,
  INNER_KEEP_AMBIENT_CLEARANCE_POLICY,
  INNER_KEEP_AMBIENT_EXCLUSIONS,
  INNER_KEEP_AMBIENT_MINIMUM_BODY_CLEARANCE_METERS,
  INNER_KEEP_AMBIENT_QUALITY_BUDGETS,
  INNER_KEEP_AMBIENT_ROUTES,
  INNER_KEEP_CIVIC_MOUNTED_ROUTE,
  INNER_KEEP_FOOT_PATROL_ROUTE,
  INNER_KEEP_MOUNTED_PATROL_ROUTE,
  INNER_KEEP_OUTER_FOOT_ESCORT_ROUTE,
  innerKeepAmbientSelectionRenderCost,
  selectInnerKeepAmbientActors,
  validateInnerKeepAmbientRouteClearance
} from '../src/components/inner-keep/innerKeepAmbientPolicy';
import {
  compileInnerKeepPath,
  sampleInnerKeepPath,
  sampleInnerKeepPathAtDistance
} from '../src/components/inner-keep/innerKeepPathSampler';
import {
  INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
  INNER_KEEP_PRESENTATION_SLOTS
} from '../src/components/inner-keep/innerKeepPresentationLayoutPolicy';

describe('Inner Keep ambient presentation policy', () => {
  it('catalogs the exact eight citizens and twelve ceremonial units', () => {
    expect(INNER_KEEP_AMBIENT_ACTOR_CATALOG).toHaveLength(20);
    expect(new Set(INNER_KEEP_AMBIENT_ACTOR_CATALOG.map(({ actorId }) => actorId)).size)
      .toBe(20);
    expect(INNER_KEEP_AMBIENT_ACTOR_CATALOG.filter(({ family }) => (
      family === 'citizen'
    ))).toHaveLength(8);
    expect(INNER_KEEP_AMBIENT_ACTOR_CATALOG.filter(({ family }) => (
      family !== 'citizen'
    ))).toHaveLength(12);
    expect(INNER_KEEP_AMBIENT_ACTOR_CATALOG.filter(({ mounted }) => mounted))
      .toHaveLength(6);
    expect(INNER_KEEP_AMBIENT_ACTOR_CATALOG.map(({ actorId }) => actorId).sort())
      .toEqual([
        'astral-lancer',
        'astral-magister',
        'basilica-warden',
        'bell-herald',
        'bulwark',
        'chirurgeon-apothecary',
        'cistern-warden',
        'dusk-outrider',
        'dusk-ranger',
        'ember-lamplighter',
        'emberfoot-courier',
        'honor-guard',
        'horseguard',
        'imperial-cataphract',
        'legionary',
        'longbow-warden',
        'rift-battlemage',
        'shellback-shrine-tender',
        'vanguard',
        'ward-peacekeeper'
      ]);
    for (const entry of INNER_KEEP_AMBIENT_ACTOR_CATALOG) {
      expect(entry.sourceAssetId).toMatch(/^warpkeep\.units\.hegemony\./u);
      expect(entry.allowedAmbientClips).not.toContain('Attack');
      expect(entry.presentationRole).toBe(
        entry.family === 'citizen' ? 'civic-routine' : 'ceremonial-patrol'
      );
    }
  });

  it('selects each quality deterministically inside semantic hard budgets', () => {
    const expected = {
      high: {
        actors: 20,
        citizens: 8,
        mountedCitizens: 2,
        footPatrol: 8,
        mountedPatrol: 4
      },
      balanced: {
        actors: 12,
        citizens: 6,
        mountedCitizens: 2,
        footPatrol: 4,
        mountedPatrol: 2
      },
      reduced: {
        actors: 8,
        citizens: 4,
        mountedCitizens: 1,
        footPatrol: 3,
        mountedPatrol: 1
      }
    } as const;
    for (const quality of ['high', 'balanced', 'reduced'] as const) {
      const first = selectInnerKeepAmbientActors('keep-004', quality);
      const second = selectInnerKeepAmbientActors('keep-004', quality);
      const budget = INNER_KEEP_AMBIENT_QUALITY_BUDGETS[quality];
      expect(first).toEqual(second);
      expect(first.actors).toHaveLength(expected[quality].actors);
      expect(first.citizenCount).toBe(expected[quality].citizens);
      expect(first.mountedCitizenCount).toBe(expected[quality].mountedCitizens);
      expect(first.footPatrolUnitCount).toBe(expected[quality].footPatrol);
      expect(first.mountedPatrolUnitCount).toBe(expected[quality].mountedPatrol);
      expect(first.actors.length).toBeLessThanOrEqual(budget.maximumActors);
      expect(budget.maximumAnimatedActors).toBeLessThanOrEqual(budget.maximumActors);
      expect(budget.maximumAnimationMixers).toBeLessThanOrEqual(budget.maximumActors);
      expect(budget.maximumDrawCalls).toBeGreaterThan(0);
      expect(budget.maximumTriangles).toBeGreaterThan(0);
      const renderCost = innerKeepAmbientSelectionRenderCost(first.actors, quality);
      expect(renderCost.drawCalls).toBeLessThanOrEqual(budget.maximumDrawCalls);
      expect(renderCost.triangles).toBeLessThanOrEqual(budget.maximumTriangles);
    }
  });

  it('accounts exact model primitives and conversation sprites in render budgets', () => {
    expect(INNER_KEEP_AMBIENT_QUALITY_BUDGETS).toMatchObject({
      high: { maximumDrawCalls: 207, maximumTriangles: 65_000 },
      balanced: { maximumDrawCalls: 131, maximumTriangles: 40_000 },
      reduced: { maximumDrawCalls: 78, maximumTriangles: 16_000 }
    });
    const high = selectInnerKeepAmbientActors('all-high-assets', 'high');
    expect(innerKeepAmbientSelectionRenderCost(high.actors, 'high')).toEqual({
      actorDrawCalls: 201,
      actorTriangles: 58_792,
      conversationSpriteCount: 6,
      drawCalls: 207,
      triangles: 58_804
    });
    for (let seed = 0; seed < 256; seed += 1) {
      for (const quality of ['balanced', 'reduced'] as const) {
        const selection = selectInnerKeepAmbientActors(seed, quality);
        const cost = innerKeepAmbientSelectionRenderCost(selection.actors, quality);
        expect(cost.drawCalls).toBeLessThanOrEqual(
          INNER_KEEP_AMBIENT_QUALITY_BUDGETS[quality].maximumDrawCalls
        );
        expect(cost.triangles).toBeLessThanOrEqual(
          INNER_KEEP_AMBIENT_QUALITY_BUDGETS[quality].maximumTriangles
        );
      }
    }
  });

  it('reserves construction, slots, roads, and both landmark footprints', () => {
    expect(INNER_KEEP_AMBIENT_CLEARANCE_POLICY).toMatchObject({
      presentationOnly: true,
      gameplayAuthorityClaimed: false,
      sourcePresentationLayoutDigest: INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
      construction: {
        reserveEveryCanonicalSlot: true,
        slotCount: 12,
        additionalRouteClearanceMeters: 0.35
      },
      road: {
        northSouthCenterX: 0,
        northSouthHalfWidth: 1.3,
        requiredClearSideBuffer: 0.25
      },
      building: {
        cathedralCenterMeters: [0, -15.4],
        cathedralHalfExtentsMeters: [5.1, 4.353],
        barracksCenterMeters: [-16, 0],
        barracksHalfExtentsMeters: [3.04, 2.47]
      }
    });
    expect(INNER_KEEP_AMBIENT_CLEARANCE_POLICY.slots).toHaveLength(12);
    expect(INNER_KEEP_AMBIENT_CLEARANCE_POLICY.slots.map(({ exclusionId }) => (
      exclusionId
    ))).toEqual(INNER_KEEP_PRESENTATION_SLOTS.map(({ slotId }) => slotId));
    expect(INNER_KEEP_AMBIENT_EXCLUSIONS.map(({ exclusionId }) => exclusionId))
      .toEqual(expect.arrayContaining([
        'grand-covenant-cathedral',
        'shieldcourt-barracks',
        ...INNER_KEEP_PRESENTATION_SLOTS.map(({ slotId }) => slotId)
      ]));
    expect(INNER_KEEP_AMBIENT_AUTHORITY_BOUNDARY).toEqual({
      presentationOnly: true,
      gameplayAuthorityClaimed: false,
      acceptsServerCoordinates: false,
      writesGameplayState: false,
      usesPlayerIdentityOrChat: false
    });
  });

  it('keeps every route clear under dense physical sampling', () => {
    for (const route of INNER_KEEP_AMBIENT_ROUTES) {
      expect(
        validateInnerKeepAmbientRouteClearance(route, 0.04),
        route.routeId
      ).toEqual([]);
    }
    const innerX = INNER_KEEP_FOOT_PATROL_ROUTE.path.points.map(({ x }) => x);
    const innerZ = INNER_KEEP_FOOT_PATROL_ROUTE.path.points.map(({ z }) => z);
    const outerX = INNER_KEEP_MOUNTED_PATROL_ROUTE.path.points.map(({ x }) => x);
    const outerZ = INNER_KEEP_MOUNTED_PATROL_ROUTE.path.points.map(({ z }) => z);
    expect(Math.min(...innerX)).toBeGreaterThan(Math.min(...outerX));
    expect(Math.max(...innerX)).toBeLessThan(Math.max(...outerX));
    expect(Math.min(...innerZ)).toBeGreaterThan(Math.min(...outerZ));
    expect(Math.max(...innerZ)).toBeLessThan(Math.max(...outerZ));
    expect(INNER_KEEP_FOOT_PATROL_ROUTE.path.points).not.toEqual(
      INNER_KEEP_MOUNTED_PATROL_ROUTE.path.points
    );
    expect(INNER_KEEP_CIVIC_MOUNTED_ROUTE.path.points).toEqual(
      INNER_KEEP_MOUNTED_PATROL_ROUTE.path.points
    );
    expect(INNER_KEEP_OUTER_FOOT_ESCORT_ROUTE.path.points).toEqual(
      INNER_KEEP_MOUNTED_PATROL_ROUTE.path.points
    );
    expect(INNER_KEEP_AMBIENT_MINIMUM_BODY_CLEARANCE_METERS).toBe(0.16);
  });

  it('samples open and closed paths by arc length with exact loop continuity', () => {
    const loop = compileInnerKeepPath('test-loop', [
      { x: 0, z: 0 },
      { x: 3, z: 0 },
      { x: 3, z: 4 }
    ], true);
    const open = compileInnerKeepPath('test-open', [
      { x: 0, z: 0 },
      { x: 3, z: 0 },
      { x: 3, z: 4 }
    ], false);
    expect(loop.totalLength).toBe(12);
    expect(open.totalLength).toBe(7);
    expect(sampleInnerKeepPath(loop, 0)).toEqual(sampleInnerKeepPath(loop, 1));
    expect(sampleInnerKeepPath(loop, -0.25)).toEqual(sampleInnerKeepPath(loop, 0.75));
    expect(sampleInnerKeepPathAtDistance(open, 99).position).toEqual({ x: 3, z: 4 });
    expect(sampleInnerKeepPath(open, 0.5)).toMatchObject({
      position: { x: 3, z: 0.5 },
      segmentIndex: 1
    });
    expect(() => compileInnerKeepPath('bad', [
      { x: 0, z: 0 },
      { x: 0, z: 0 }
    ], false)).toThrow(/zero-length segment/u);
  });

  it('contains no random or wall-clock dependency in the pure modules', () => {
    for (const file of [
      'innerKeepAmbientPolicy.ts',
      'innerKeepAmbientTimeline.ts',
      'innerKeepPathSampler.ts'
    ]) {
      const source = readFileSync(resolve(
        import.meta.dirname,
        `../src/components/inner-keep/${file}`
      ), 'utf8');
      expect(source).not.toMatch(/Math\.random|Date\.now|performance\.now/u);
    }
  });
});
