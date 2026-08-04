import {
  deriveChannelSeed,
  hashSeedString,
  mixUint32,
  seededUnitFloat
} from '../../game/map/realmSeed';
import {
  INNER_KEEP_PRESENTATION_CLEARANCES,
  INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
  INNER_KEEP_PRESENTATION_SLOTS
} from './innerKeepPresentationLayoutPolicy';
import {
  compileInnerKeepPath,
  sampleInnerKeepPath,
  type InnerKeepCompiledPath,
  type InnerKeepPathPoint
} from './innerKeepPathSampler';
import { INNER_KEEP_POPULATION_RUNTIME_ACTORS } from './innerKeepRuntimeAssetCatalog.generated';
import { INNER_KEEP_FIXED_PLACEMENT_EXCLUSIONS } from './innerKeepFixedPlacementExclusions';
import {
  INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS,
  INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT,
  innerKeepOuterWorldDistanceToRoad,
} from './innerKeepOuterWorldPolicy';

export const INNER_KEEP_AMBIENT_POLICY_ID = 'genesis-001-inner-keep-ambient-v2';
export const INNER_KEEP_AMBIENT_POLICY_VERSION = 2;

export type InnerKeepAmbientQuality = 'high' | 'balanced' | 'reduced';
export type InnerKeepAmbientActorFamily =
  | 'citizen'
  | 'infantry'
  | 'ranged'
  | 'cavalry';
export type InnerKeepAmbientActorCategory =
  | 'citizen'
  | 'civic-mounted'
  | 'foot-patrol'
  | 'mounted-patrol';
export type InnerKeepAmbientPresentationRole =
  | 'civic-routine'
  | 'ceremonial-patrol';
export type InnerKeepAmbientClip = 'Greet' | 'Idle' | 'Walk' | 'Work';

export type InnerKeepAmbientActorCatalogEntry = Readonly<{
  actorId: string;
  sourceAssetId: string;
  displayName: string;
  family: InnerKeepAmbientActorFamily;
  mounted: boolean;
  category: InnerKeepAmbientActorCategory;
  presentationRole: InnerKeepAmbientPresentationRole;
  allowedAmbientClips: readonly InnerKeepAmbientClip[];
}>;

function actor(
  actorId: string,
  sourceAssetId: string,
  displayName: string,
  family: InnerKeepAmbientActorFamily,
  mounted: boolean
): InnerKeepAmbientActorCatalogEntry {
  const citizen = family === 'citizen';
  return Object.freeze({
    actorId,
    sourceAssetId,
    displayName,
    family,
    mounted,
    category: citizen
      ? mounted ? 'civic-mounted' : 'citizen'
      : mounted ? 'mounted-patrol' : 'foot-patrol',
    presentationRole: citizen ? 'civic-routine' : 'ceremonial-patrol',
    // Combat clips are intentionally excluded from this presentation-only policy.
    allowedAmbientClips: Object.freeze(citizen
      ? ['Greet', 'Idle', 'Walk', 'Work'] as const
      : ['Idle', 'Walk'] as const)
  });
}

/** Exact runtime-selected population identities; no player identity is present. */
export const INNER_KEEP_AMBIENT_ACTOR_CATALOG: readonly InnerKeepAmbientActorCatalogEntry[] =
  Object.freeze([
    actor(
      'basilica-warden',
      'warpkeep.units.hegemony.citizens-set2.basilica-warden',
      'Hegemony Basilica Warden',
      'citizen',
      false
    ),
    actor(
      'bell-herald',
      'warpkeep.units.hegemony.citizens-set2.bell-herald',
      'Hegemony Bell Herald',
      'citizen',
      false
    ),
    actor(
      'chirurgeon-apothecary',
      'warpkeep.units.hegemony.citizens-set2.chirurgeon-apothecary',
      'Hegemony Chirurgeon-Apothecary',
      'citizen',
      false
    ),
    actor(
      'cistern-warden',
      'warpkeep.units.hegemony.citizens-set2.cistern-warden',
      'Hegemony Cistern Warden',
      'citizen',
      false
    ),
    actor(
      'ember-lamplighter',
      'warpkeep.units.hegemony.citizens-set2.ember-lamplighter',
      'Hegemony Ember Lamplighter',
      'citizen',
      false
    ),
    actor(
      'emberfoot-courier',
      'warpkeep.units.hegemony.citizens-set2.emberfoot-courier',
      'Hegemony Emberfoot Courier',
      'citizen',
      true
    ),
    actor(
      'shellback-shrine-tender',
      'warpkeep.units.hegemony.citizens-set2.shellback-shrine-tender',
      'Hegemony Shellback Shrine Tender',
      'citizen',
      true
    ),
    actor(
      'ward-peacekeeper',
      'warpkeep.units.hegemony.citizens-set2.ward-peacekeeper',
      'Hegemony Ward Peacekeeper',
      'citizen',
      false
    ),
    actor(
      'bulwark',
      'warpkeep.units.hegemony.infantry.bulwark',
      'Hegemony Bulwark',
      'infantry',
      false
    ),
    actor(
      'honor-guard',
      'warpkeep.units.hegemony.infantry.honor-guard',
      'Hegemony Honor Guard',
      'infantry',
      false
    ),
    actor(
      'legionary',
      'warpkeep.units.hegemony.infantry.legionary',
      'Hegemony Legionary',
      'infantry',
      false
    ),
    actor(
      'vanguard',
      'warpkeep.units.hegemony.infantry.vanguard',
      'Hegemony Vanguard',
      'infantry',
      false
    ),
    actor(
      'astral-magister',
      'warpkeep.units.hegemony.ranged.astral-magister',
      'Hegemony Astral Magister',
      'ranged',
      false
    ),
    actor(
      'dusk-ranger',
      'warpkeep.units.hegemony.ranged.dusk-ranger',
      'Hegemony Dusk Ranger',
      'ranged',
      false
    ),
    actor(
      'longbow-warden',
      'warpkeep.units.hegemony.ranged.longbow-warden',
      'Hegemony Longbow Warden',
      'ranged',
      false
    ),
    actor(
      'rift-battlemage',
      'warpkeep.units.hegemony.ranged.rift-battlemage',
      'Hegemony Rift Battlemage',
      'ranged',
      false
    ),
    actor(
      'astral-lancer',
      'warpkeep.units.hegemony.cavalry.astral-lancer',
      'Hegemony Astral Lancer',
      'cavalry',
      true
    ),
    actor(
      'dusk-outrider',
      'warpkeep.units.hegemony.cavalry.dusk-outrider',
      'Hegemony Dusk Outrider',
      'cavalry',
      true
    ),
    actor(
      'horseguard',
      'warpkeep.units.hegemony.cavalry.horseguard',
      'Hegemony Horseguard',
      'cavalry',
      true
    ),
    actor(
      'imperial-cataphract',
      'warpkeep.units.hegemony.cavalry.imperial-cataphract',
      'Hegemony Imperial Cataphract',
      'cavalry',
      true
    )
  ]);

export type InnerKeepAmbientQualityBudget = Readonly<{
  maximumCitizens: number;
  maximumMountedCitizens: number;
  maximumFootPatrolUnits: number;
  maximumMountedPatrolUnits: number;
  maximumActors: number;
  maximumAnimatedActors: number;
  maximumAnimationMixers: number;
  maximumConversationPairs: number;
  maximumDrawCalls: number;
  maximumTriangles: number;
  animationFrameCap: number;
  populationAssetProfile: 'balanced' | 'compact';
}>;

export const INNER_KEEP_AMBIENT_QUALITY_BUDGETS: Readonly<
  Record<InnerKeepAmbientQuality, InnerKeepAmbientQualityBudget>
> = Object.freeze({
  high: Object.freeze({
    maximumCitizens: 8,
    maximumMountedCitizens: 2,
    maximumFootPatrolUnits: 8,
    maximumMountedPatrolUnits: 4,
    maximumActors: 20,
    maximumAnimatedActors: 20,
    maximumAnimationMixers: 20,
    maximumConversationPairs: 3,
    maximumDrawCalls: 207,
    maximumTriangles: 65_000,
    animationFrameCap: 30,
    populationAssetProfile: 'balanced'
  }),
  balanced: Object.freeze({
    maximumCitizens: 6,
    maximumMountedCitizens: 2,
    maximumFootPatrolUnits: 4,
    maximumMountedPatrolUnits: 2,
    maximumActors: 12,
    maximumAnimatedActors: 12,
    maximumAnimationMixers: 12,
    maximumConversationPairs: 2,
    maximumDrawCalls: 131,
    maximumTriangles: 40_000,
    animationFrameCap: 24,
    populationAssetProfile: 'balanced'
  }),
  reduced: Object.freeze({
    maximumCitizens: 4,
    maximumMountedCitizens: 1,
    maximumFootPatrolUnits: 3,
    maximumMountedPatrolUnits: 1,
    maximumActors: 8,
    maximumAnimatedActors: 0,
    maximumAnimationMixers: 0,
    maximumConversationPairs: 0,
    maximumDrawCalls: 78,
    maximumTriangles: 16_000,
    animationFrameCap: 0,
    populationAssetProfile: 'compact'
  })
});

export type InnerKeepAmbientRouteKind =
  | 'citizen-approach'
  | 'citizen-work-shuttle'
  | 'foot-duty-shuttle'
  | 'civic-mounted-loop'
  | 'foot-patrol-loop'
  | 'mounted-patrol-loop';

export type InnerKeepAmbientRoutePurpose =
  | 'social-visit'
  | 'district-supply-run'
  | 'cathedral-watch'
  | 'garrison-watch'
  | 'east-wall-watch'
  | 'south-gate-watch'
  | 'estate-delivery'
  | 'perimeter-patrol'
  | 'road-escort';

export type InnerKeepAmbientRoute = Readonly<{
  routeId: string;
  kind: InnerKeepAmbientRouteKind;
  purpose: InnerKeepAmbientRoutePurpose;
  actorRadiusMeters: number;
  path: InnerKeepCompiledPath;
}>;

/** Conservative body-to-body gap retained by the deterministic formation. */
export const INNER_KEEP_AMBIENT_MINIMUM_BODY_CLEARANCE_METERS = 0.16;

export type InnerKeepAmbientFootprintHalfExtents = readonly [number, number];

export type InnerKeepAmbientOrientedFootprint = Readonly<{
  position: InnerKeepPathPoint;
  yawRadians: number;
  footprintHalfExtentsMeters: InnerKeepAmbientFootprintHalfExtents;
}>;

function footprintProjectionRadiusOnAxis(
  footprint: InnerKeepAmbientOrientedFootprint,
  cosine: number,
  sine: number,
  axisX: number,
  axisZ: number
): number {
  return footprint.footprintHalfExtentsMeters[0]
      * Math.abs(cosine * axisX - sine * axisZ)
    + footprint.footprintHalfExtentsMeters[1]
      * Math.abs(sine * axisX + cosine * axisZ);
}

/**
 * Separating-axis proof for two X/Z oriented model bounds. A non-negative
 * result proves at least the requested clearance on one separating axis.
 */
export function innerKeepAmbientOrientedFootprintSeparation(
  left: InnerKeepAmbientOrientedFootprint,
  right: InnerKeepAmbientOrientedFootprint,
  requiredClearanceMeters = 0
): number {
  const deltaX = right.position.x - left.position.x;
  const deltaZ = right.position.z - left.position.z;
  const leftCosine = Math.cos(left.yawRadians);
  const leftSine = Math.sin(left.yawRadians);
  const rightCosine = Math.cos(right.yawRadians);
  const rightSine = Math.sin(right.yawRadians);
  const requiredClearance = Math.max(0, requiredClearanceMeters);
  const separationOnAxis = (axisX: number, axisZ: number): number => (
    Math.abs(deltaX * axisX + deltaZ * axisZ)
      - footprintProjectionRadiusOnAxis(
        left,
        leftCosine,
        leftSine,
        axisX,
        axisZ
      )
      - footprintProjectionRadiusOnAxis(
        right,
        rightCosine,
        rightSine,
        axisX,
        axisZ
      )
      - requiredClearance
  );
  return Math.max(
    separationOnAxis(leftCosine, -leftSine),
    separationOnAxis(leftSine, leftCosine),
    separationOnAxis(rightCosine, -rightSine),
    separationOnAxis(rightSine, rightCosine)
  );
}

/** The same authored display heights consumed by the renderer and spacing proof. */
export function innerKeepAmbientTargetHeightMeters(
  category: InnerKeepAmbientActorCategory
): number {
  if (category === 'mounted-patrol') return 2.15;
  if (category === 'civic-mounted') return 1.92;
  return 1.62;
}

/** Exact selected GLB X/Z bounds after the renderer's height normalization. */
export function innerKeepAmbientActorFootprintHalfExtents(
  actor: Pick<InnerKeepAmbientActorCatalogEntry, 'actorId' | 'category'>,
  quality: InnerKeepAmbientQuality
): InnerKeepAmbientFootprintHalfExtents {
  const profile = INNER_KEEP_AMBIENT_QUALITY_BUDGETS[quality]
    .populationAssetProfile;
  const runtimeActor = INNER_KEEP_POPULATION_RUNTIME_ACTORS.find(({ id }) => (
    id === actor.actorId
  ));
  if (!runtimeActor) {
    throw new Error(`Inner Keep actor ${actor.actorId} has no runtime footprint.`);
  }
  const bounds = runtimeActor.models[profile].boundsMeters;
  const scale = innerKeepAmbientTargetHeightMeters(actor.category)
    / Math.max(0.001, bounds[1]);
  return Object.freeze([
    bounds[0] * scale * 0.5,
    bounds[2] * scale * 0.5
  ] as const);
}

function ambientRoute(
  routeId: string,
  kind: InnerKeepAmbientRouteKind,
  purpose: InnerKeepAmbientRoutePurpose,
  actorRadiusMeters: number,
  points: readonly InnerKeepPathPoint[],
  closed: boolean
): InnerKeepAmbientRoute {
  return Object.freeze({
    routeId,
    kind,
    purpose,
    actorRadiusMeters,
    path: compileInnerKeepPath(routeId, points, closed)
  });
}

/*
 * City residents use short point-to-point errands and guards hold distinct
 * watch beats. Only the true perimeter patrol remains a closed circuit.
 */
function smoothClosedAmbientRoutePoints(
  source: readonly InnerKeepPathPoint[],
  passes = 2
): readonly InnerKeepPathPoint[] {
  let points = source.map((point) => Object.freeze({ ...point }));
  for (let pass = 0; pass < passes; pass += 1) {
    points = points.flatMap((point, index) => {
      const next = points[(index + 1) % points.length]!;
      return [
        Object.freeze({
          x: point.x * 0.85 + next.x * 0.15,
          z: point.z * 0.85 + next.z * 0.15
        }),
        Object.freeze({
          x: point.x * 0.15 + next.x * 0.85,
          z: point.z * 0.15 + next.z * 0.85
        })
      ];
    });
  }
  return Object.freeze(points);
}

const INNER_KEEP_NORTHWEST_OUTER_MOUNTED_LOOP_POINTS:
readonly InnerKeepPathPoint[] = smoothClosedAmbientRoutePoints(
  INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS,
);

export const INNER_KEEP_CITIZEN_WORK_ROUTES: readonly InnerKeepAmbientRoute[] =
  Object.freeze([
    ambientRoute(
      'inner-keep-west-green-supply-run-v1',
      'citizen-work-shuttle',
      'district-supply-run',
      0.28,
      [
        { x: -12, z: 7.2 },
        { x: -10, z: 7.6 },
        { x: -8, z: 7.2 }
      ],
      false
    ),
    ambientRoute(
      'inner-keep-east-green-supply-run-v1',
      'citizen-work-shuttle',
      'district-supply-run',
      0.28,
      [
        { x: 10, z: 7 },
        { x: 12, z: 7.4 },
        { x: 14, z: 7 }
      ],
      false
    ),
    ambientRoute(
      'inner-keep-northwest-service-run-v1',
      'citizen-work-shuttle',
      'district-supply-run',
      0.28,
      [
        { x: -10.5, z: -10 },
        { x: -8.6, z: -9.6 },
        { x: -6.8, z: -10 }
      ],
      false
    )
  ]);

export const INNER_KEEP_FOOT_DUTY_ROUTES: readonly InnerKeepAmbientRoute[] =
  Object.freeze([
    ambientRoute(
      'inner-keep-cathedral-west-watch-v1',
      'foot-duty-shuttle',
      'cathedral-watch',
      0.32,
      [
        { x: -9.2, z: -16.5 },
        { x: -9.7, z: -14.5 },
        { x: -9.2, z: -12.5 }
      ],
      false
    ),
    ambientRoute(
      'inner-keep-cathedral-east-watch-v1',
      'foot-duty-shuttle',
      'cathedral-watch',
      0.32,
      [
        { x: 9, z: -16.5 },
        { x: 9.5, z: -15 },
        { x: 9, z: -13.5 }
      ],
      false
    ),
    ambientRoute(
      'inner-keep-garrison-road-watch-v1',
      'foot-duty-shuttle',
      'garrison-watch',
      0.32,
      [
        { x: -14.8, z: 3.9 },
        { x: -14.4, z: 5.35 },
        { x: -14.8, z: 6.8 }
      ],
      false
    ),
    ambientRoute(
      'inner-keep-east-wall-watch-v1',
      'foot-duty-shuttle',
      'east-wall-watch',
      0.32,
      [
        { x: 14, z: -5 },
        { x: 14.4, z: -3 },
        { x: 14, z: -1 }
      ],
      false
    ),
    ambientRoute(
      'inner-keep-south-gate-watch-v1',
      'foot-duty-shuttle',
      'south-gate-watch',
      0.32,
      [
        { x: -3, z: 10 },
        { x: -1, z: 10.35 },
        { x: 1, z: 10 }
      ],
      false
    )
  ]);

export const INNER_KEEP_CIVIC_MOUNTED_ROUTE = ambientRoute(
  'inner-keep-civic-mounted-loop-v1',
  'civic-mounted-loop',
  'estate-delivery',
  0.42,
  INNER_KEEP_NORTHWEST_OUTER_MOUNTED_LOOP_POINTS,
  true
);

export const INNER_KEEP_MOUNTED_PATROL_ROUTE = ambientRoute(
  'inner-keep-barracks-mounted-patrol-loop-v1',
  'mounted-patrol-loop',
  'perimeter-patrol',
  0.42,
  INNER_KEEP_NORTHWEST_OUTER_MOUNTED_LOOP_POINTS,
  true
);

export const INNER_KEEP_OUTER_FOOT_ESCORT_ROUTE = ambientRoute(
  'inner-keep-outer-foot-escort-loop-v1',
  'foot-patrol-loop',
  'road-escort',
  0.32,
  INNER_KEEP_NORTHWEST_OUTER_MOUNTED_LOOP_POINTS,
  true
);

export type InnerKeepConversationAnchor = Readonly<{
  anchorId: string;
  meetingPositions: readonly [InnerKeepPathPoint, InnerKeepPathPoint];
  homePositions: readonly [InnerKeepPathPoint, InnerKeepPathPoint];
  approachRoutes: readonly [InnerKeepAmbientRoute, InnerKeepAmbientRoute];
}>;

function conversationAnchor(
  anchorId: string,
  leftHome: InnerKeepPathPoint,
  leftMeeting: InnerKeepPathPoint,
  rightHome: InnerKeepPathPoint,
  rightMeeting: InnerKeepPathPoint,
  leftWaypoints: readonly InnerKeepPathPoint[] = [],
  rightWaypoints: readonly InnerKeepPathPoint[] = []
): InnerKeepConversationAnchor {
  const left = ambientRoute(
    `inner-keep-conversation-${anchorId}-left-v1`,
    'citizen-approach',
    'social-visit',
    0.28,
    [leftHome, ...leftWaypoints, leftMeeting],
    false
  );
  const right = ambientRoute(
    `inner-keep-conversation-${anchorId}-right-v1`,
    'citizen-approach',
    'social-visit',
    0.28,
    [rightHome, ...rightWaypoints, rightMeeting],
    false
  );
  return Object.freeze({
    anchorId,
    meetingPositions: Object.freeze([
      Object.freeze({ ...leftMeeting }),
      Object.freeze({ ...rightMeeting })
    ] as const),
    homePositions: Object.freeze([
      Object.freeze({ ...leftHome }),
      Object.freeze({ ...rightHome })
    ] as const),
    approachRoutes: Object.freeze([left, right] as const)
  });
}

export const INNER_KEEP_CONVERSATION_ANCHORS: readonly InnerKeepConversationAnchor[] =
  Object.freeze([
    conversationAnchor(
      'gate-approach',
      { x: -0.78, z: 12.45 },
      { x: -0.5, z: 11.9 },
      { x: 0.78, z: 12.45 },
      { x: 0.5, z: 11.9 },
      [{ x: -0.88, z: 12.15 }],
      [{ x: 0.88, z: 12.15 }]
    ),
    conversationAnchor(
      'civic-road-watch',
      { x: -0.78, z: 4.1 },
      { x: -0.75, z: 3.35 },
      { x: 0.78, z: 4.1 },
      { x: 0.75, z: 3.35 }
    ),
    conversationAnchor(
      'north-road-watch',
      { x: -0.78, z: -3.85 },
      { x: -0.75, z: -5.35 },
      { x: 0.78, z: -3.85 },
      { x: 0.75, z: -5.35 }
    )
  ]);

export type InnerKeepAmbientExclusionKind =
  | 'slot-building-and-construction'
  | 'central-building'
  | 'civic-prop'
  | 'fixed-authored-placement';

export type InnerKeepAmbientExclusion = Readonly<{
  exclusionId: string;
  kind: InnerKeepAmbientExclusionKind;
  center: InnerKeepPathPoint;
  halfExtentsMeters: readonly [number, number];
  additionalClearanceMeters: number;
}>;

const slotExclusions: readonly InnerKeepAmbientExclusion[] = Object.freeze(
  INNER_KEEP_PRESENTATION_SLOTS.map((slot) => {
    const halfExtents = slot.footprintClass === 'large'
      ? INNER_KEEP_PRESENTATION_CLEARANCES.slot.largeReservedHalfExtents
      : INNER_KEEP_PRESENTATION_CLEARANCES.slot.mediumHalfExtents;
    return Object.freeze({
      exclusionId: slot.slotId,
      kind: 'slot-building-and-construction' as const,
      center: Object.freeze({ x: slot.positionMeters[0], z: slot.positionMeters[2] }),
      halfExtentsMeters: Object.freeze([halfExtents[0], halfExtents[1]] as const),
      additionalClearanceMeters:
        INNER_KEEP_PRESENTATION_CLEARANCES.slot.decorativeBuffer
    });
  })
);

const fixedAuthoredExclusions: readonly InnerKeepAmbientExclusion[] =
  Object.freeze(INNER_KEEP_FIXED_PLACEMENT_EXCLUSIONS.flatMap((candidate) => (
    candidate.isRoadSurface
      ? []
      : [Object.freeze({
          exclusionId: candidate.placementId,
          kind: 'fixed-authored-placement' as const,
          center: candidate.center,
          halfExtentsMeters: candidate.halfExtentsMeters,
          additionalClearanceMeters: candidate.clearanceMarginMeters
        })]
  )));

function exclusion(
  exclusionId: string,
  kind: Exclude<InnerKeepAmbientExclusionKind, 'slot-building-and-construction'>,
  x: number,
  z: number,
  halfX: number,
  halfZ: number,
  additionalClearanceMeters: number
): InnerKeepAmbientExclusion {
  return Object.freeze({
    exclusionId,
    kind,
    center: Object.freeze({ x, z }),
    halfExtentsMeters: Object.freeze([halfX, halfZ] as const),
    additionalClearanceMeters
  });
}

/**
 * Every authoritative slot stays reserved even while empty, so construction
 * can begin without an ambient route suddenly becoming invalid.
 */
export const INNER_KEEP_AMBIENT_EXCLUSIONS: readonly InnerKeepAmbientExclusion[] =
  Object.freeze([
    ...slotExclusions,
    ...fixedAuthoredExclusions,
    exclusion('central-keep', 'central-building', 0, -0.15, 2.3, 1.9, 0.18),
    // Exact layout scale is applied to the selected landmark X/Z bounds.
    exclusion('grand-covenant-cathedral', 'central-building', 0, -15.4, 5.1, 4.353, 0.8),
    exclusion('shieldcourt-barracks', 'central-building', -16, 0, 3.04, 2.47, 0.55),
    exclusion('east-wall-keep-well', 'civic-prop', 16.7, 0.4, 1, 0.9, 0.12),
    exclusion('water-trough', 'civic-prop', 5.2, 12.7, 0.9, 0.5, 0.12),
    exclusion('west-plaza-bench', 'civic-prop', -3.1, 1.6, 1, 0.5, 0.12),
    exclusion('east-plaza-bench', 'civic-prop', 3.1, 1.6, 1, 0.5, 0.12),
    exclusion('west-plaza-lamp', 'civic-prop', -1.6, 4.95, 0.3, 0.3, 0.12),
    exclusion('east-plaza-lamp', 'civic-prop', 1.6, 4.95, 0.3, 0.3, 0.12),
    exclusion('west-plaza-brazier', 'civic-prop', -1.45, 2.05, 0.35, 0.35, 0.12),
    exclusion('east-plaza-brazier', 'civic-prop', 1.45, 2.05, 0.35, 0.35, 0.12),
    exclusion('builder-noticeboard', 'civic-prop', -3, 11.65, 1.1, 0.4, 0.12)
  ]);

export const INNER_KEEP_AMBIENT_CLEARANCE_POLICY = Object.freeze({
  presentationOnly: true,
  gameplayAuthorityClaimed: false,
  sourcePresentationLayoutDigest: INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
  construction: Object.freeze({
    reserveEveryCanonicalSlot: true,
    slotCount: INNER_KEEP_PRESENTATION_SLOTS.length,
    additionalRouteClearanceMeters:
      INNER_KEEP_PRESENTATION_CLEARANCES.slot.decorativeBuffer
  }),
  building: Object.freeze({
    centralKeepCenterMeters: Object.freeze([0, -0.15] as const),
    centralKeepHalfExtentsMeters: Object.freeze([2.3, 1.9] as const),
    cathedralCenterMeters: Object.freeze([0, -15.4] as const),
    cathedralHalfExtentsMeters: Object.freeze([5.1, 4.353] as const),
    barracksCenterMeters: Object.freeze([-16, 0] as const),
    barracksHalfExtentsMeters: Object.freeze([3.04, 2.47] as const)
  }),
  road: Object.freeze({
    northSouthCenterX: INNER_KEEP_PRESENTATION_CLEARANCES.road.northSouthCenterX,
    northSouthHalfWidth: INNER_KEEP_PRESENTATION_CLEARANCES.road.northSouthHalfWidth,
    requiredClearSideBuffer:
      INNER_KEEP_PRESENTATION_CLEARANCES.road.requiredClearSideBuffer,
    southernNavigableMinimumZ: 2.42,
    southernNavigableMaximumZ: 13.68
  }),
  plaza: Object.freeze({
    centerMeters: Object.freeze([0, 3.15] as const),
    radiusMeters: 3.15,
    requiredEdgeBufferMeters: 0.2
  }),
  outerCourtyard: Object.freeze({
    westX: INNER_KEEP_PRESENTATION_CLEARANCES.wall.westX,
    eastX: INNER_KEEP_PRESENTATION_CLEARANCES.wall.eastX,
    northZ: INNER_KEEP_PRESENTATION_CLEARANCES.wall.northZ,
    southZ: INNER_KEEP_PRESENTATION_CLEARANCES.wall.southZ,
    requiredWallBufferMeters: 0.45
  }),
  slots: Object.freeze(slotExclusions)
});

export type InnerKeepAmbientRouteClearanceViolation = Readonly<{
  routeId: string;
  kind: 'outside-navigation-surface' | 'exclusion-overlap';
  exclusionId?: string;
  position: InnerKeepPathPoint;
}>;

export function isInnerKeepAmbientPointNavigable(
  point: InnerKeepPathPoint,
  actorRadiusMeters: number
): boolean {
  if (
    !Number.isFinite(point.x)
    || !Number.isFinite(point.z)
    || !Number.isFinite(actorRadiusMeters)
    || actorRadiusMeters < 0
  ) return false;
  const road = INNER_KEEP_AMBIENT_CLEARANCE_POLICY.road;
  const roadHalfWidth = road.northSouthHalfWidth
    - road.requiredClearSideBuffer
    - actorRadiusMeters;
  const onRoad = point.z >= road.southernNavigableMinimumZ
    && point.z <= road.southernNavigableMaximumZ
    && Math.abs(point.x - road.northSouthCenterX) <= roadHalfWidth;
  const plaza = INNER_KEEP_AMBIENT_CLEARANCE_POLICY.plaza;
  const plazaRadius = plaza.radiusMeters
    - plaza.requiredEdgeBufferMeters
    - actorRadiusMeters;
  const onPlaza = Math.hypot(
    point.x - plaza.centerMeters[0],
    point.z - plaza.centerMeters[1]
  ) <= plazaRadius;
  const courtyard = INNER_KEEP_AMBIENT_CLEARANCE_POLICY.outerCourtyard;
  const wallBuffer = courtyard.requiredWallBufferMeters + actorRadiusMeters;
  const inOuterCourtyard = point.x >= courtyard.westX + wallBuffer
    && point.x <= courtyard.eastX - wallBuffer
    && point.z >= courtyard.northZ + wallBuffer
    && point.z <= courtyard.southZ - wallBuffer;
  const outerRoadHalfWidth = Math.max(
    0.08,
    INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.halfWidthMeters - actorRadiusMeters,
  );
  const onOuterEstateRoad = innerKeepOuterWorldDistanceToRoad(point.x, point.z)
    <= outerRoadHalfWidth;
  return onRoad || onPlaza || inOuterCourtyard || onOuterEstateRoad;
}

function pointOverlapsExclusion(
  point: InnerKeepPathPoint,
  actorRadiusMeters: number,
  candidate: InnerKeepAmbientExclusion
): boolean {
  const padding = actorRadiusMeters + candidate.additionalClearanceMeters;
  return Math.abs(point.x - candidate.center.x)
      <= candidate.halfExtentsMeters[0] + padding
    && Math.abs(point.z - candidate.center.z)
      <= candidate.halfExtentsMeters[1] + padding;
}

/** Dense deterministic validation used by tests and future runtime preflight. */
export function validateInnerKeepAmbientRouteClearance(
  route: InnerKeepAmbientRoute,
  sampleSpacingMeters = 0.08
): readonly InnerKeepAmbientRouteClearanceViolation[] {
  const spacing = Number.isFinite(sampleSpacingMeters) && sampleSpacingMeters > 0
    ? Math.max(0.02, sampleSpacingMeters)
    : 0.08;
  const sampleCount = Math.max(1, Math.ceil(route.path.totalLength / spacing));
  const violations: InnerKeepAmbientRouteClearanceViolation[] = [];
  for (let index = 0; index <= sampleCount; index += 1) {
    const progress = index / sampleCount;
    const position = sampleInnerKeepPath(route.path, progress).position;
    if (!isInnerKeepAmbientPointNavigable(position, route.actorRadiusMeters)) {
      violations.push(Object.freeze({
        routeId: route.routeId,
        kind: 'outside-navigation-surface' as const,
        position
      }));
      continue;
    }
    const overlap = INNER_KEEP_AMBIENT_EXCLUSIONS.find((candidate) => (
      pointOverlapsExclusion(position, route.actorRadiusMeters, candidate)
    ));
    if (overlap) {
      violations.push(Object.freeze({
        routeId: route.routeId,
        kind: 'exclusion-overlap' as const,
        exclusionId: overlap.exclusionId,
        position
      }));
    }
  }
  return Object.freeze(violations);
}

export const INNER_KEEP_AMBIENT_ROUTES: readonly InnerKeepAmbientRoute[] = Object.freeze([
  INNER_KEEP_CIVIC_MOUNTED_ROUTE,
  INNER_KEEP_MOUNTED_PATROL_ROUTE,
  INNER_KEEP_OUTER_FOOT_ESCORT_ROUTE,
  ...INNER_KEEP_CITIZEN_WORK_ROUTES,
  ...INNER_KEEP_FOOT_DUTY_ROUTES,
  ...INNER_KEEP_CONVERSATION_ANCHORS.flatMap((anchor) => anchor.approachRoutes)
]);

export function resolveInnerKeepAmbientSeed(seed: string | number): number {
  return typeof seed === 'string'
    ? hashSeedString(seed)
    : mixUint32(Number.isFinite(seed) ? Math.trunc(seed) : 0);
}

function rankedActors(
  actors: readonly InnerKeepAmbientActorCatalogEntry[],
  worldSeed: number,
  channel: string
): readonly InnerKeepAmbientActorCatalogEntry[] {
  return Object.freeze([...actors].sort((left, right) => {
    const leftRank = deriveChannelSeed(
      worldSeed,
      0,
      0,
      `inner-keep-ambient-selection:${channel}`,
      hashSeedString(left.actorId)
    );
    const rightRank = deriveChannelSeed(
      worldSeed,
      0,
      0,
      `inner-keep-ambient-selection:${channel}`,
      hashSeedString(right.actorId)
    );
    return leftRank - rightRank || left.actorId.localeCompare(right.actorId);
  }));
}

export type InnerKeepAmbientActorSelection = Readonly<{
  seed: number;
  quality: InnerKeepAmbientQuality;
  actors: readonly InnerKeepAmbientActorCatalogEntry[];
  citizenCount: number;
  mountedCitizenCount: number;
  footPatrolUnitCount: number;
  mountedPatrolUnitCount: number;
}>;

export function innerKeepAmbientSelectionRenderCost(
  actors: readonly Pick<InnerKeepAmbientActorCatalogEntry, 'actorId'>[],
  quality: InnerKeepAmbientQuality
) {
  const budget = INNER_KEEP_AMBIENT_QUALITY_BUDGETS[quality];
  const modelByActorId = new Map(INNER_KEEP_POPULATION_RUNTIME_ACTORS.map((actor) => [
    actor.id,
    actor.models[budget.populationAssetProfile]
  ] as const));
  let actorDrawCalls = 0;
  let actorTriangles = 0;
  for (const actor of actors) {
    const model = modelByActorId.get(actor.actorId);
    if (!model) throw new Error(`Inner Keep actor ${actor.actorId} has no runtime model.`);
    actorDrawCalls += model.drawCalls;
    actorTriangles += model.triangles;
  }
  const conversationSpriteCount = budget.maximumConversationPairs * 2;
  return Object.freeze({
    actorDrawCalls,
    actorTriangles,
    conversationSpriteCount,
    drawCalls: actorDrawCalls + conversationSpriteCount,
    triangles: actorTriangles + conversationSpriteCount * 2
  });
}

/**
 * Select within each semantic category independently. Adding an unrelated
 * catalog family cannot perturb the rank of existing citizens or patrols.
 */
export function selectInnerKeepAmbientActors(
  seed: string | number,
  quality: InnerKeepAmbientQuality
): InnerKeepAmbientActorSelection {
  const worldSeed = resolveInnerKeepAmbientSeed(seed);
  const budget = INNER_KEEP_AMBIENT_QUALITY_BUDGETS[quality];
  const mountedCitizens = rankedActors(
    INNER_KEEP_AMBIENT_ACTOR_CATALOG.filter((entry) => entry.category === 'civic-mounted'),
    worldSeed,
    'civic-mounted'
  ).slice(0, budget.maximumMountedCitizens);
  const footCitizenLimit = budget.maximumCitizens - mountedCitizens.length;
  const footCitizens = rankedActors(
    INNER_KEEP_AMBIENT_ACTOR_CATALOG.filter((entry) => entry.category === 'citizen'),
    worldSeed,
    'citizen'
  ).slice(0, footCitizenLimit);
  const footPatrol = rankedActors(
    INNER_KEEP_AMBIENT_ACTOR_CATALOG.filter((entry) => entry.category === 'foot-patrol'),
    worldSeed,
    'foot-patrol'
  ).slice(0, budget.maximumFootPatrolUnits);
  const mountedPatrol = rankedActors(
    INNER_KEEP_AMBIENT_ACTOR_CATALOG.filter((entry) => entry.category === 'mounted-patrol'),
    worldSeed,
    'mounted-patrol'
  ).slice(0, budget.maximumMountedPatrolUnits);
  const actors = Object.freeze([
    ...footCitizens,
    ...mountedCitizens,
    ...footPatrol,
    ...mountedPatrol
  ]);
  if (actors.length > budget.maximumActors) {
    throw new Error(`Inner Keep ${quality} actor selection exceeds its hard budget.`);
  }
  const renderCost = innerKeepAmbientSelectionRenderCost(actors, quality);
  if (
    renderCost.drawCalls > budget.maximumDrawCalls
    || renderCost.triangles > budget.maximumTriangles
  ) throw new Error(`Inner Keep ${quality} actor render selection exceeds its hard budget.`);
  return Object.freeze({
    seed: worldSeed,
    quality,
    actors,
    citizenCount: footCitizens.length + mountedCitizens.length,
    mountedCitizenCount: mountedCitizens.length,
    footPatrolUnitCount: footPatrol.length,
    mountedPatrolUnitCount: mountedPatrol.length
  });
}

export function innerKeepAmbientDeterministicUnit(
  seed: string | number,
  stableId: string,
  channel: string
): number {
  const worldSeed = resolveInnerKeepAmbientSeed(seed);
  return seededUnitFloat(deriveChannelSeed(
    worldSeed,
    0,
    0,
    `inner-keep-ambient:${channel}`,
    hashSeedString(stableId)
  ));
}

export const INNER_KEEP_AMBIENT_AUTHORITY_BOUNDARY = Object.freeze({
  presentationOnly: true,
  gameplayAuthorityClaimed: false,
  acceptsServerCoordinates: false,
  writesGameplayState: false,
  usesPlayerIdentityOrChat: false
});
