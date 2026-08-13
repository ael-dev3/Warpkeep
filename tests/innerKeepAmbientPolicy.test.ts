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
  INNER_KEEP_CITIZEN_WORK_ROUTES,
  INNER_KEEP_CIVIC_MOUNTED_ROUTES,
  INNER_KEEP_FOOT_DUTY_ROUTES,
  INNER_KEEP_MOUNTED_DUTY_ROUTES,
  innerKeepAmbientActorFootprintHalfExtents,
  innerKeepAmbientOrientedFootprintSeparation,
  innerKeepAmbientRouteIsExterior,
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
import {
  INNER_KEEP_EAST_VILLAGE_SERVICE_LANE,
  INNER_KEEP_OUTER_WORLD_SUPPLY_WAGON_FOOTPRINT_METERS,
  INNER_KEEP_OUTER_WORLD_TRADE_ROUTE,
  INNER_KEEP_VILLAGE_COMMONS_SOCIAL_LANE,
  INNER_KEEP_WEST_VILLAGE_DELIVERY_LANE,
  innerKeepOuterWorldDistanceToSegment
} from '../src/components/inner-keep/innerKeepOuterWorldPolicy';

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
      high: { maximumDrawCalls: 205, maximumTriangles: 58_800 },
      balanced: { maximumDrawCalls: 129, maximumTriangles: 35_348 },
      reduced: { maximumDrawCalls: 78, maximumTriangles: 14_188 }
    });
    const high = selectInnerKeepAmbientActors('all-high-assets', 'high');
    expect(innerKeepAmbientSelectionRenderCost(high.actors, 'high')).toEqual({
      actorDrawCalls: 201,
      actorTriangles: 58_792,
      conversationSpriteCount: 4,
      drawCalls: 205,
      triangles: 58_800
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

  it('binds dynamic free placement while keeping static actors on permanent surfaces', () => {
    expect(INNER_KEEP_AMBIENT_CLEARANCE_POLICY).toMatchObject({
      presentationOnly: true,
      gameplayAuthorityClaimed: false,
      sourcePresentationLayoutDigest: INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
      construction: {
        placementBoundsMicrounits: {
          minimumX: -44_000_000n,
          maximumX: 44_000_000n,
          minimumZ: -40_000_000n,
          maximumZ: 32_000_000n
        },
        snapIncrementMicrounits: 500_000n,
        supportedRotationMilliDegrees: [0, 90_000, 180_000, 270_000],
        dynamicBuildingExclusionsRequired: true,
        staticRoutesUsePermanentSurfacesOnly: true
      },
      road: {
        northSouthCenterX: 0,
        northSouthHalfWidth: 2,
        requiredClearSideBuffer: 1
      },
      building: {
        initialPrebuiltConstructibleCount: 0,
        templateScalePermille: 1_000,
        constructibleBuildingKinds: [
          'city-mill',
          'lumber-camp',
          'city-stoneworks',
          'city-goldworks',
          'city-barracks',
          'grand-covenant-cathedral'
        ]
      }
    });
    expect(INNER_KEEP_PRESENTATION_SLOTS).toEqual([]);
    expect('slots' in INNER_KEEP_AMBIENT_CLEARANCE_POLICY).toBe(false);
    expect(INNER_KEEP_AMBIENT_EXCLUSIONS.map(({ exclusionId }) => exclusionId))
      .not.toEqual(expect.arrayContaining([
        'grand-covenant-cathedral',
        'shieldcourt-barracks'
      ]));
    expect(INNER_KEEP_AMBIENT_AUTHORITY_BOUNDARY).toEqual({
      presentationOnly: true,
      gameplayAuthorityClaimed: false,
      acceptsServerCoordinates: false,
      writesGameplayState: false,
      usesPlayerIdentityOrChat: false
    });
  });

  it('keeps distinct open city duties and the outer circuit clear under dense sampling', () => {
    for (const route of INNER_KEEP_AMBIENT_ROUTES) {
      expect(
        validateInnerKeepAmbientRouteClearance(route, 0.04),
        route.routeId
      ).toEqual([]);
    }

    expect(INNER_KEEP_CITIZEN_WORK_ROUTES).toHaveLength(3);
    expect(INNER_KEEP_FOOT_DUTY_ROUTES).toHaveLength(8);
    expect(INNER_KEEP_CIVIC_MOUNTED_ROUTES).toHaveLength(2);
    expect(INNER_KEEP_MOUNTED_DUTY_ROUTES).toHaveLength(4);
    const cityDutyRoutes = [
      ...INNER_KEEP_CITIZEN_WORK_ROUTES,
      ...INNER_KEEP_FOOT_DUTY_ROUTES,
      ...INNER_KEEP_CIVIC_MOUNTED_ROUTES,
      ...INNER_KEEP_MOUNTED_DUTY_ROUTES
    ];
    expect(new Set(cityDutyRoutes.map(({ routeId }) => routeId)).size)
      .toBe(cityDutyRoutes.length);
    expect(cityDutyRoutes.every(({ path }) => !path.closed)).toBe(true);
    expect(INNER_KEEP_CITIZEN_WORK_ROUTES.every(({ kind, purpose }) => (
      kind === 'citizen-work-shuttle' && purpose === 'district-supply-run'
    ))).toBe(true);
    expect(INNER_KEEP_FOOT_DUTY_ROUTES.map(({ purpose }) => purpose))
      .toEqual([
        'south-gate-watch',
        'west-road-watch',
        'south-gate-watch',
        'north-road-watch',
        'south-gate-watch',
        'east-road-watch',
        'south-road-watch',
        'south-gate-watch'
      ]);
    expect(INNER_KEEP_CIVIC_MOUNTED_ROUTES.map(({ purpose }) => purpose))
      .toEqual(['village-delivery', 'village-shrine-service']);
    expect(INNER_KEEP_AMBIENT_ROUTES.filter(innerKeepAmbientRouteIsExterior))
      .toHaveLength(10);
    expect(INNER_KEEP_CIVIC_MOUNTED_ROUTES.every(innerKeepAmbientRouteIsExterior))
      .toBe(true);
    expect(INNER_KEEP_MOUNTED_DUTY_ROUTES.every(innerKeepAmbientRouteIsExterior))
      .toBe(true);
    expect(INNER_KEEP_CITIZEN_WORK_ROUTES.some(innerKeepAmbientRouteIsExterior))
      .toBe(false);
    expect(INNER_KEEP_EAST_VILLAGE_SERVICE_LANE).toMatchObject({
      presentationOnly: true,
      gameplayAuthorityClaimed: false
    });
    expect(INNER_KEEP_WEST_VILLAGE_DELIVERY_LANE).toMatchObject({
      presentationOnly: true,
      gameplayAuthorityClaimed: false
    });
    expect(INNER_KEEP_VILLAGE_COMMONS_SOCIAL_LANE).toMatchObject({
      presentationOnly: true,
      gameplayAuthorityClaimed: false
    });

    // Open duties must remain direct point-to-point beats, not almost-closed
    // ellipses disguised by leaving a small gap between their endpoints.
    for (const route of cityDutyRoutes) {
      const first = route.path.points[0]!;
      const last = route.path.points.at(-1)!;
      const endpointDistance = Math.hypot(last.x - first.x, last.z - first.z);
      expect(endpointDistance / route.path.totalLength, route.routeId)
        .toBeGreaterThan(0.75);
    }

    const closedRoutes = INNER_KEEP_AMBIENT_ROUTES.filter(({ path }) => path.closed);
    expect(closedRoutes).toEqual([]);
    expect(INNER_KEEP_AMBIENT_ROUTES.some(({ kind }) => (
      kind === 'civic-mounted-loop'
      || kind === 'foot-patrol-loop'
      || kind === 'mounted-patrol-loop'
    ))).toBe(false);
    expect(INNER_KEEP_AMBIENT_MINIMUM_BODY_CLEARANCE_METERS).toBe(0.16);
  });

  it('keeps the exotic courier physically separate from the supply wagon lane', () => {
    const courier = INNER_KEEP_AMBIENT_ACTOR_CATALOG.find(({ actorId }) => (
      actorId === 'emberfoot-courier'
    ))!;
    const [courierHalfWidth, courierHalfDepth] =
      innerKeepAmbientActorFootprintHalfExtents(courier, 'high');
    const conservativeRequiredSeparation =
      INNER_KEEP_OUTER_WORLD_SUPPLY_WAGON_FOOTPRINT_METERS * 0.5
      + Math.hypot(courierHalfWidth, courierHalfDepth)
      + INNER_KEEP_AMBIENT_MINIMUM_BODY_CLEARANCE_METERS;
    const route = INNER_KEEP_CIVIC_MOUNTED_ROUTES.find(({ purpose }) => (
      purpose === 'village-delivery'
    ))!;
    const samples = Math.ceil(route.path.totalLength / 0.02);
    let minimumSeparation = Number.POSITIVE_INFINITY;
    for (let index = 0; index <= samples; index += 1) {
      const point = sampleInnerKeepPath(route.path, index / samples).position;
      for (
        let segmentIndex = 0;
        segmentIndex < INNER_KEEP_OUTER_WORLD_TRADE_ROUTE.length - 1;
        segmentIndex += 1
      ) {
        const from = INNER_KEEP_OUTER_WORLD_TRADE_ROUTE[segmentIndex]!;
        const to = INNER_KEEP_OUTER_WORLD_TRADE_ROUTE[segmentIndex + 1]!;
        minimumSeparation = Math.min(
          minimumSeparation,
          innerKeepOuterWorldDistanceToSegment(
            point.x,
            point.z,
            from[0],
            from[2],
            to[0],
            to[2]
          )
        );
      }
    }
    expect(minimumSeparation).toBeGreaterThanOrEqual(conservativeRequiredSeparation);
  });

  it('clears every exact actor footprint through each shuttle turnaround', () => {
    let minimumResidual = Number.POSITIVE_INFINITY;
    let minimumDetail = '';
    for (const route of [
      ...INNER_KEEP_CITIZEN_WORK_ROUTES,
      ...INNER_KEEP_FOOT_DUTY_ROUTES,
      ...INNER_KEEP_CIVIC_MOUNTED_ROUTES,
      ...INNER_KEEP_MOUNTED_DUTY_ROUTES
    ]) {
      const category = route.kind === 'citizen-work-shuttle'
        ? 'citizen'
        : route.kind === 'foot-duty-shuttle'
          ? 'foot-patrol'
          : route.kind === 'civic-mounted-shuttle'
            ? 'civic-mounted'
            : 'mounted-patrol';
      const actors = INNER_KEEP_AMBIENT_ACTOR_CATALOG.filter((actor) => (
        actor.category === category
      ));
      for (const actor of actors) {
        const footprintHalfExtentsMeters = innerKeepAmbientActorFootprintHalfExtents(
          actor,
          'high'
        );
        for (const progress of [0, 1]) {
          const position = sampleInnerKeepPath(route.path, progress).position;
          for (let headingIndex = 0; headingIndex < 64; headingIndex += 1) {
            const yawRadians = headingIndex / 64 * Math.PI * 2;
            for (const exclusion of INNER_KEEP_AMBIENT_EXCLUSIONS) {
              const residual = innerKeepAmbientOrientedFootprintSeparation(
                { position, yawRadians, footprintHalfExtentsMeters },
                {
                  position: exclusion.center,
                  yawRadians: 0,
                  footprintHalfExtentsMeters: [
                    exclusion.halfExtentsMeters[0]
                      + exclusion.additionalClearanceMeters,
                    exclusion.halfExtentsMeters[1]
                      + exclusion.additionalClearanceMeters
                  ]
                }
              );
              if (residual < minimumResidual) {
                minimumResidual = residual;
                minimumDetail = [
                  route.routeId,
                  actor.actorId,
                  progress,
                  headingIndex,
                  exclusion.exclusionId
                ].join(':');
              }
            }
          }
        }
      }
    }
    expect(minimumResidual, minimumDetail).toBeGreaterThanOrEqual(0);
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
