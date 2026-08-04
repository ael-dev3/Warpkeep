import {
  INNER_KEEP_AMBIENT_QUALITY_BUDGETS,
  INNER_KEEP_CIVIC_MOUNTED_ROUTE,
  INNER_KEEP_CONVERSATION_ANCHORS,
  INNER_KEEP_FOOT_PATROL_ROUTE,
  INNER_KEEP_MOUNTED_PATROL_ROUTE,
  INNER_KEEP_OUTER_FOOT_ESCORT_ROUTE,
  innerKeepAmbientActorFootprintHalfExtents,
  innerKeepAmbientDeterministicUnit,
  selectInnerKeepAmbientActors,
  type InnerKeepAmbientActorCatalogEntry,
  type InnerKeepAmbientActorCategory,
  type InnerKeepAmbientClip,
  type InnerKeepAmbientQuality,
  type InnerKeepAmbientFootprintHalfExtents,
  type InnerKeepAmbientRoute,
  type InnerKeepConversationAnchor
} from './innerKeepAmbientPolicy';
import {
  sampleInnerKeepPath,
  wrapInnerKeepUnitProgress,
  type InnerKeepPathPoint,
  type InnerKeepPathSample
} from './innerKeepPathSampler';

export const INNER_KEEP_AMBIENT_CONVERSATION_CYCLE_SECONDS = 96;
export const INNER_KEEP_AMBIENT_CONVERSATION_TRAVEL_SECONDS = 10;
export const INNER_KEEP_AMBIENT_CONVERSATION_SECONDS = 8;
export const INNER_KEEP_AMBIENT_GREETING_SECONDS = 1.35;
export const INNER_KEEP_AMBIENT_CLIP_BLEND_SECONDS = 0.2;

const INNER_KEEP_OUTER_FORMATION_ORDER = new Map([
  'shellback-shrine-tender',
  'dusk-outrider',
  'astral-magister',
  'emberfoot-courier',
  'legionary',
  'horseguard',
  'imperial-cataphract',
  'astral-lancer',
  'honor-guard'
].map((actorId, index) => [actorId, index] as const));

const INNER_KEEP_INNER_FORMATION_ORDER = new Map([
  'basilica-warden',
  'bulwark',
  'bell-herald',
  'dusk-ranger',
  'chirurgeon-apothecary',
  'rift-battlemage',
  'cistern-warden',
  'vanguard',
  'ember-lamplighter',
  'longbow-warden',
  'ward-peacekeeper',
  'honor-guard',
  'legionary',
  'astral-magister'
].map((actorId, index) => [actorId, index] as const));

/** Extra authored slack retained above the public 0.16 m body-clearance floor. */
export const INNER_KEEP_AMBIENT_FORMATION_CLEARANCE_MARGIN_METERS = 0.004;

/*
 * These normalized offsets were solved offline against every route segment,
 * vertex, and heading-blend boundary using the exact runtime model bounds.
 * Keeping the result as data makes plan creation linear in the actor count;
 * scene reconciliation never runs a geometric optimizer on the main thread.
 */
const INNER_KEEP_HIGH_INNER_FORMATION_OFFSETS = new Map<string, number>([
  ['bulwark', 0],
  ['dusk-ranger', 0.20335317397123684],
  ['rift-battlemage', 0.4086366426081307],
  ['vanguard', 0.6076224732309025],
  ['longbow-warden', 0.8028899032514791]
]);

const INNER_KEEP_HIGH_OUTER_FORMATION_OFFSETS = new Map<string, number>([
  ['shellback-shrine-tender', 0],
  ['dusk-outrider', 0.1336703191065016],
  ['astral-magister', 0.24083765798382775],
  ['emberfoot-courier', 0.3221705473795066],
  ['legionary', 0.40262796192869893],
  ['horseguard', 0.5020060280298867],
  ['imperial-cataphract', 0.6517977669357661],
  ['astral-lancer', 0.8112005280259625],
  ['honor-guard', 0.9205338181883783]
]);

const INNER_KEEP_OUTER_RELATIVE_ROTATION_BY_QUALITY: Readonly<
  Record<InnerKeepAmbientQuality, number>
> = Object.freeze({
  high: 0.98779296875,
  /*
   * Offline exhaustive proof: all 420 reachable balanced formations collapse
   * to 464 oriented slot/actor-pair variants. A 65,536-step full-loop sweep,
   * vertex/heading-boundary neighborhoods, and a 1,000,000-step refinement of
   * the limiting Dusk Ranger/Cataphract pair retain a 0.003850 m residual.
   */
  balanced: 0.9222412109375,
  reduced: 0
});

/*
 * Reduced quality is static, so it uses one authored tableau instead of a
 * seed-rotated loop. All 8,960 reachable reduced formations were evaluated at
 * these exact bases; the limiting Dusk Ranger/Legionary pair retains 0.086365 m
 * beyond the public body-clearance floor. The outer base also proves every
 * reachable actor slot against the fixed-placement exclusions.
 */
const INNER_KEEP_REDUCED_FORMATION_ROTATION: Readonly<
  Record<'inner' | 'outer', number>
> = Object.freeze({
  inner: 0.677734375,
  outer: 0.3896484375
});

export type InnerKeepAmbientBehavior =
  | 'walk'
  | 'idle'
  | 'greet'
  | 'work'
  | 'static-formation';

export type InnerKeepAmbientConversation = Readonly<{
  conversationId: string;
  anchorId: string;
  partnerActorId: string;
  side: 0 | 1;
}>;

type InnerKeepConversationRoutine = Readonly<{
  kind: 'conversation';
  actor: InnerKeepAmbientActorCatalogEntry;
  route: InnerKeepAmbientRoute;
  anchor: InnerKeepConversationAnchor;
  side: 0 | 1;
  conversationId: string;
  partnerActorId: string;
  conversationStartSeconds: number;
  cycleDurationSeconds: number;
  staticProgress: number;
  clipPhaseOffset: number;
  footprintHalfExtentsMeters: InnerKeepAmbientFootprintHalfExtents;
}>;

type InnerKeepLoopRoutine = Readonly<{
  kind: 'loop';
  actor: InnerKeepAmbientActorCatalogEntry;
  route: InnerKeepAmbientRoute;
  speedMetersPerSecond: number;
  travelDurationSeconds: number;
  haltDurationSeconds: number;
  cycleDurationSeconds: number;
  phaseOffsetSeconds: number;
  staticProgress: number;
  clipPhaseOffset: number;
  footprintHalfExtentsMeters: InnerKeepAmbientFootprintHalfExtents;
}>;

type InnerKeepLoopTiming = Readonly<{
  travelDurationSeconds: number;
  haltDurationSeconds: number;
  cycleDurationSeconds: number;
  phaseOffsetSeconds: number;
}>;

export type InnerKeepAmbientActorRoutine =
  | InnerKeepConversationRoutine
  | InnerKeepLoopRoutine;

export type InnerKeepAmbientConversationPlan = Readonly<{
  conversationId: string;
  anchorId: string;
  actorIds: readonly [string, string];
  conversationStartSeconds: number;
  conversationDurationSeconds: number;
  cycleDurationSeconds: number;
}>;

export type InnerKeepAmbientSimulationPlan = Readonly<{
  planId: string;
  seed: number;
  quality: InnerKeepAmbientQuality;
  reducedMotion: boolean;
  motionEnabled: boolean;
  presentationOnly: true;
  gameplayAuthorityClaimed: false;
  animationFrameCap: number;
  routines: readonly InnerKeepAmbientActorRoutine[];
  conversations: readonly InnerKeepAmbientConversationPlan[];
}>;

export type InnerKeepAmbientActorPose = Readonly<{
  actorId: string;
  sourceAssetId: string;
  category: InnerKeepAmbientActorCategory;
  mounted: boolean;
  presentationRole: 'civic-routine' | 'ceremonial-patrol';
  routeId: string;
  collisionRadiusMeters: number;
  footprintHalfExtentsMeters: InnerKeepAmbientFootprintHalfExtents;
  position: InnerKeepPathPoint;
  yawRadians: number;
  routeProgress: number;
  behavior: InnerKeepAmbientBehavior;
  clipName: InnerKeepAmbientClip;
  clipPhase: number;
  clipBlend: InnerKeepAmbientClipBlend | null;
  animated: boolean;
  conversation: InnerKeepAmbientConversation | null;
}>;

export type InnerKeepAmbientClipBlend = Readonly<{
  fromClipName: InnerKeepAmbientClip;
  fromClipPhase: number;
  progress: number;
}>;

export type InnerKeepAmbientFrame = Readonly<{
  sampleSeconds: number;
  animationFrameCap: number;
  animationActive: boolean;
  presentationOnly: true;
  gameplayAuthorityClaimed: false;
  actors: readonly InnerKeepAmbientActorPose[];
  activeConversationCount: number;
  animatedActorCount: number;
  mountedActorCount: number;
  patrolUnitCount: number;
}>;

function positiveModulo(value: number, modulus: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) return 0;
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

function finiteElapsedSeconds(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function easeInOutCubic(progress: number): number {
  const bounded = Math.max(0, Math.min(1, progress));
  return bounded < 0.5
    ? 4 * bounded * bounded * bounded
    : 1 - Math.pow(-2 * bounded + 2, 3) * 0.5;
}

function smoothStep(progress: number): number {
  const bounded = Math.max(0, Math.min(1, progress));
  return bounded * bounded * (3 - 2 * bounded);
}

function oppositeYaw(yawRadians: number): number {
  const value = yawRadians + Math.PI;
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function blendYaw(fromYaw: number, toYaw: number, progress: number): number {
  const delta = Math.atan2(
    Math.sin(toYaw - fromYaw),
    Math.cos(toYaw - fromYaw)
  );
  return fromYaw + delta * smoothStep(progress);
}

function yawToward(from: InnerKeepPathPoint, to: InnerKeepPathPoint): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function clipPhase(value: number): number {
  return wrapInnerKeepUnitProgress(value);
}

function rankedAnchors(seed: number): readonly InnerKeepConversationAnchor[] {
  return Object.freeze([...INNER_KEEP_CONVERSATION_ANCHORS].sort((left, right) => {
    const leftRank = innerKeepAmbientDeterministicUnit(
      seed,
      left.anchorId,
      'conversation-anchor-rank'
    );
    const rightRank = innerKeepAmbientDeterministicUnit(
      seed,
      right.anchorId,
      'conversation-anchor-rank'
    );
    return leftRank - rightRank || left.anchorId.localeCompare(right.anchorId);
  }));
}

function pairId(leftActorId: string, rightActorId: string): string {
  return `inner-keep-conversation:${[leftActorId, rightActorId].sort().join(':')}`;
}

function loopRoutine(
  seed: number,
  quality: InnerKeepAmbientQuality,
  actor: InnerKeepAmbientActorCatalogEntry,
  route: InnerKeepAmbientRoute,
  formationId: string,
  formationProgress: number,
  minimumSpeed: number,
  maximumSpeed: number,
  minimumHaltSeconds: number,
  maximumHaltSeconds: number,
  sharedTiming?: InnerKeepLoopTiming
): InnerKeepLoopRoutine {
  const speedUnit = innerKeepAmbientDeterministicUnit(
    seed,
    formationId,
    'group-speed'
  );
  const defaultSpeedMetersPerSecond = minimumSpeed
    + (maximumSpeed - minimumSpeed) * speedUnit;
  const travelDurationSeconds = sharedTiming?.travelDurationSeconds
    ?? route.path.totalLength / defaultSpeedMetersPerSecond;
  const speedMetersPerSecond = route.path.totalLength / travelDurationSeconds;
  const haltDurationSeconds = sharedTiming?.haltDurationSeconds
    ?? minimumHaltSeconds
      + (maximumHaltSeconds - minimumHaltSeconds) * innerKeepAmbientDeterministicUnit(
        seed,
        formationId,
        'group-halt'
      );
  const cycleDurationSeconds = sharedTiming?.cycleDurationSeconds
    ?? travelDurationSeconds + haltDurationSeconds;
  const groupTimeOffset = sharedTiming
    ? sharedTiming.phaseOffsetSeconds / sharedTiming.cycleDurationSeconds
    : innerKeepAmbientDeterministicUnit(seed, formationId, 'group-time-offset');
  return Object.freeze({
    kind: 'loop',
    actor,
    route,
    speedMetersPerSecond,
    travelDurationSeconds,
    haltDurationSeconds,
    cycleDurationSeconds,
    phaseOffsetSeconds: sharedTiming?.phaseOffsetSeconds
      ?? groupTimeOffset * cycleDurationSeconds,
    staticProgress: formationProgress,
    clipPhaseOffset: innerKeepAmbientDeterministicUnit(
      seed,
      actor.actorId,
      'clip-phase'
    ),
    footprintHalfExtentsMeters: innerKeepAmbientActorFootprintHalfExtents(
      actor,
      quality
    )
  });
}

function authoredFormationProgressByActorId(
  seed: number,
  quality: InnerKeepAmbientQuality,
  formationId: string,
  actors: readonly InnerKeepAmbientActorCatalogEntry[],
  lane: 'inner' | 'outer'
): ReadonlyMap<string, number> {
  if (actors.length === 0) return new Map();
  const highOffsets = lane === 'inner'
    ? INNER_KEEP_HIGH_INNER_FORMATION_OFFSETS
    : INNER_KEEP_HIGH_OUTER_FORMATION_OFFSETS;
  const useHighOffsets = quality === 'high'
    && actors.length === highOffsets.size
    && actors.every(({ actorId }) => highOffsets.has(actorId));
  const rotation = quality === 'reduced'
    ? INNER_KEEP_REDUCED_FORMATION_ROTATION[lane]
    : innerKeepAmbientDeterministicUnit(
      seed,
      'northwest-processional-formation-v3',
      'formation-rotation'
    ) + (lane === 'outer'
      ? INNER_KEEP_OUTER_RELATIVE_ROTATION_BY_QUALITY[quality]
      : 0);
  const progressByActorId = new Map<string, number>();
  actors.forEach((actor, index) => {
    const offset = useHighOffsets
      ? highOffsets.get(actor.actorId)!
      : index / actors.length;
    progressByActorId.set(
      actor.actorId,
      wrapInnerKeepUnitProgress(rotation + offset)
    );
  });
  if (progressByActorId.size !== actors.length) {
    throw new Error(`Inner Keep formation ${formationId} contains a duplicate actor.`);
  }
  return progressByActorId;
}

function sharedNorthwestLoopTiming(
  seed: number,
  route: InnerKeepAmbientRoute
): InnerKeepLoopTiming {
  const speed = 0.74 + 0.08 * innerKeepAmbientDeterministicUnit(
    seed,
    'northwest-processional-timing-v2',
    'group-speed'
  );
  const travelDurationSeconds = route.path.totalLength / speed;
  const haltDurationSeconds = 3.2 + 1.8 * innerKeepAmbientDeterministicUnit(
    seed,
    'northwest-processional-timing-v2',
    'group-halt'
  );
  const cycleDurationSeconds = travelDurationSeconds + haltDurationSeconds;
  return Object.freeze({
    travelDurationSeconds,
    haltDurationSeconds,
    cycleDurationSeconds,
    phaseOffsetSeconds: innerKeepAmbientDeterministicUnit(
      seed,
      'northwest-processional-timing-v2',
      'group-time-offset'
    ) * cycleDurationSeconds
  });
}

export function createInnerKeepAmbientSimulationPlan(options: Readonly<{
  seed: string | number;
  quality: InnerKeepAmbientQuality;
  reducedMotion?: boolean;
}>): InnerKeepAmbientSimulationPlan {
  const reducedMotion = options.reducedMotion === true;
  const selection = selectInnerKeepAmbientActors(options.seed, options.quality);
  const seed = selection.seed;
  const budget = INNER_KEEP_AMBIENT_QUALITY_BUDGETS[options.quality];
  const routineByActorId = new Map<string, InnerKeepAmbientActorRoutine>();
  const conversationPlans: InnerKeepAmbientConversationPlan[] = [];
  const footCitizens = selection.actors.filter(({ category }) => category === 'citizen');
  const maximumPairCount = Math.min(
    Math.floor(footCitizens.length / 2),
    budget.maximumConversationPairs
  );
  const anchors = rankedAnchors(seed);
  for (let pairIndex = 0; pairIndex < maximumPairCount; pairIndex += 1) {
    const left = footCitizens[pairIndex * 2]!;
    const right = footCitizens[pairIndex * 2 + 1]!;
    const anchor = anchors[pairIndex % anchors.length]!;
    const conversationId = pairId(left.actorId, right.actorId);
    const conversationStartSeconds = 18 + pairIndex * 24;
    conversationPlans.push(Object.freeze({
      conversationId,
      anchorId: anchor.anchorId,
      actorIds: Object.freeze([left.actorId, right.actorId] as const),
      conversationStartSeconds,
      conversationDurationSeconds: INNER_KEEP_AMBIENT_CONVERSATION_SECONDS,
      cycleDurationSeconds: INNER_KEEP_AMBIENT_CONVERSATION_CYCLE_SECONDS
    }));
    ([left, right] as const).forEach((entry, side) => {
      const sideIndex = side as 0 | 1;
      routineByActorId.set(entry.actorId, Object.freeze({
        kind: 'conversation' as const,
        actor: entry,
        route: anchor.approachRoutes[sideIndex],
        anchor,
        side: sideIndex,
        conversationId,
        partnerActorId: sideIndex === 0 ? right.actorId : left.actorId,
        conversationStartSeconds,
        cycleDurationSeconds: INNER_KEEP_AMBIENT_CONVERSATION_CYCLE_SECONDS,
        staticProgress: 0,
        clipPhaseOffset: innerKeepAmbientDeterministicUnit(
          seed,
          entry.actorId,
          'clip-phase'
        ),
        footprintHalfExtentsMeters: innerKeepAmbientActorFootprintHalfExtents(
          entry,
          options.quality
        )
      }));
    });
  }

  const unpairedCitizens = footCitizens.filter((entry) => !routineByActorId.has(entry.actorId));
  const civicMounted = selection.actors.filter(({ category }) => category === 'civic-mounted');
  const footPatrol = selection.actors.filter(({ category }) => category === 'foot-patrol');
  const outerFootPatrolCount = Math.max(1, Math.ceil(footPatrol.length * 0.33));
  const outerFootPatrol = [...footPatrol]
    .sort((left, right) => {
      const leftExtents = innerKeepAmbientActorFootprintHalfExtents(
        left,
        options.quality
      );
      const rightExtents = innerKeepAmbientActorFootprintHalfExtents(
        right,
        options.quality
      );
      return Math.hypot(...leftExtents) - Math.hypot(...rightExtents)
        || left.actorId.localeCompare(right.actorId);
    })
    .slice(0, outerFootPatrolCount);
  const outerFootPatrolIds = new Set(outerFootPatrol.map(({ actorId }) => actorId));
  const innerFootPatrol = footPatrol.filter(({ actorId }) => (
    !outerFootPatrolIds.has(actorId)
  ));
  const mountedPatrol = selection.actors.filter(({ category }) => (
    category === 'mounted-patrol'
  ));
  const innerProcessionalFormation = [
    ...unpairedCitizens.map((actor) => Object.freeze({
      actor,
      route: INNER_KEEP_FOOT_PATROL_ROUTE
    })),
    ...innerFootPatrol.map((actor) => Object.freeze({
      actor,
      route: INNER_KEEP_FOOT_PATROL_ROUTE
    }))
  ].sort((left, right) => (
    (INNER_KEEP_INNER_FORMATION_ORDER.get(left.actor.actorId)
      ?? Number.MAX_SAFE_INTEGER)
    - (INNER_KEEP_INNER_FORMATION_ORDER.get(right.actor.actorId)
      ?? Number.MAX_SAFE_INTEGER)
    || left.actor.actorId.localeCompare(right.actor.actorId)
  ));
  const innerProgress = authoredFormationProgressByActorId(
    seed,
    options.quality,
    'northwest-inner-processional-formation-v2',
    innerProcessionalFormation.map(({ actor }) => actor),
    'inner'
  );
  const northwestTiming = sharedNorthwestLoopTiming(
    seed,
    INNER_KEEP_MOUNTED_PATROL_ROUTE
  );
  innerProcessionalFormation.forEach(({ actor, route }) => {
    routineByActorId.set(actor.actorId, loopRoutine(
      seed,
      options.quality,
      actor,
      route,
      'northwest-inner-processional-formation-v2',
      innerProgress.get(actor.actorId)!,
      0.78,
      0.9,
      3.2,
      5,
      northwestTiming
    ));
  });
  const outerMountedFormation = [
    ...civicMounted.map((actor) => Object.freeze({
      actor,
      route: INNER_KEEP_CIVIC_MOUNTED_ROUTE
    })),
    ...mountedPatrol.map((actor) => Object.freeze({
      actor,
      route: INNER_KEEP_MOUNTED_PATROL_ROUTE
    })),
    ...outerFootPatrol.map((actor) => Object.freeze({
      actor,
      route: INNER_KEEP_OUTER_FOOT_ESCORT_ROUTE
    }))
  ].sort((left, right) => (
    (INNER_KEEP_OUTER_FORMATION_ORDER.get(left.actor.actorId)
      ?? Number.MAX_SAFE_INTEGER)
    - (INNER_KEEP_OUTER_FORMATION_ORDER.get(right.actor.actorId)
      ?? Number.MAX_SAFE_INTEGER)
    || left.actor.actorId.localeCompare(right.actor.actorId)
  ));
  const mountedProgress = authoredFormationProgressByActorId(
    seed,
    options.quality,
    'northwest-outer-mounted-formation-v2',
    outerMountedFormation.map(({ actor }) => actor),
    'outer'
  );
  outerMountedFormation.forEach(({ actor, route }) => {
    routineByActorId.set(actor.actorId, loopRoutine(
      seed,
      options.quality,
      actor,
      route,
      'northwest-outer-mounted-formation-v2',
      mountedProgress.get(actor.actorId)!,
      0.72,
      0.82,
      3.2,
      5,
      northwestTiming
    ));
  });

  const routines = Object.freeze(selection.actors.map((entry) => {
    const routine = routineByActorId.get(entry.actorId);
    if (!routine) throw new Error(`Inner Keep actor ${entry.actorId} has no routine.`);
    return routine;
  }));
  if (
    routines.length > budget.maximumActors
    || conversationPlans.length > budget.maximumConversationPairs
  ) throw new Error(`Inner Keep ${options.quality} ambient plan exceeds its hard budget.`);
  const motionEnabled = !reducedMotion && budget.maximumAnimatedActors > 0;
  return Object.freeze({
    planId: `inner-keep-ambient:${seed}:${options.quality}:${motionEnabled ? 'motion' : 'static'}`,
    seed,
    quality: options.quality,
    reducedMotion,
    motionEnabled,
    presentationOnly: true,
    gameplayAuthorityClaimed: false,
    animationFrameCap: motionEnabled ? budget.animationFrameCap : 0,
    routines,
    conversations: Object.freeze(conversationPlans)
  });
}

function poseFromSample(
  routine: InnerKeepAmbientActorRoutine,
  sample: InnerKeepPathSample,
  yawRadians: number,
  behavior: InnerKeepAmbientBehavior,
  clipName: InnerKeepAmbientClip,
  phase: number,
  animated: boolean,
  conversation: InnerKeepAmbientConversation | null
): InnerKeepAmbientActorPose {
  return Object.freeze({
    actorId: routine.actor.actorId,
    sourceAssetId: routine.actor.sourceAssetId,
    category: routine.actor.category,
    mounted: routine.actor.mounted,
    presentationRole: routine.actor.presentationRole,
    routeId: routine.route.routeId,
    collisionRadiusMeters: routine.route.actorRadiusMeters,
    footprintHalfExtentsMeters: routine.footprintHalfExtentsMeters,
    position: sample.position,
    yawRadians,
    routeProgress: sample.normalizedProgress,
    behavior,
    clipName,
    clipPhase: clipPhase(phase),
    clipBlend: null,
    animated,
    conversation
  });
}

function staticPose(routine: InnerKeepAmbientActorRoutine): InnerKeepAmbientActorPose {
  const sample = sampleInnerKeepPath(routine.route.path, routine.staticProgress);
  return poseFromSample(
    routine,
    sample,
    sample.yawRadians,
    'static-formation',
    'Idle',
    routine.clipPhaseOffset,
    false,
    null
  );
}

function sampleConversationRoutine(
  routine: InnerKeepConversationRoutine,
  elapsedSeconds: number
): InnerKeepAmbientActorPose {
  const local = positiveModulo(elapsedSeconds, routine.cycleDurationSeconds);
  const outboundStart = routine.conversationStartSeconds
    - INNER_KEEP_AMBIENT_CONVERSATION_TRAVEL_SECONDS;
  const conversationEnd = routine.conversationStartSeconds
    + INNER_KEEP_AMBIENT_CONVERSATION_SECONDS;
  const returnEnd = conversationEnd + INNER_KEEP_AMBIENT_CONVERSATION_TRAVEL_SECONDS;
  if (local >= outboundStart && local < routine.conversationStartSeconds) {
    const progress = easeInOutCubic(
      (local - outboundStart) / INNER_KEEP_AMBIENT_CONVERSATION_TRAVEL_SECONDS
    );
    const sample = sampleInnerKeepPath(routine.route.path, progress);
    const partnerPosition = routine.anchor.meetingPositions[
      routine.side === 0 ? 1 : 0
    ];
    const meetingYaw = yawToward(sample.position, partnerPosition);
    const meetingBlend = Math.max(0, Math.min(1, (progress - 0.35) / 0.65));
    return poseFromSample(
      routine,
      sample,
      blendYaw(sample.yawRadians, meetingYaw, meetingBlend),
      'walk',
      'Walk',
      sample.distance * 1.45 + routine.clipPhaseOffset,
      true,
      null
    );
  }
  if (local >= routine.conversationStartSeconds && local < conversationEnd) {
    const talkSeconds = local - routine.conversationStartSeconds;
    const sample = sampleInnerKeepPath(routine.route.path, 1);
    const partnerPosition = routine.anchor.meetingPositions[routine.side === 0 ? 1 : 0];
    const greetingSide = talkSeconds < INNER_KEEP_AMBIENT_GREETING_SECONDS
      ? 0
      : talkSeconds < INNER_KEEP_AMBIENT_GREETING_SECONDS * 2
        ? 1
        : null;
    const greeting = greetingSide === routine.side;
    return poseFromSample(
      routine,
      sample,
      yawToward(sample.position, partnerPosition),
      greeting ? 'greet' : 'idle',
      greeting ? 'Greet' : 'Idle',
      talkSeconds * (greeting ? 0.82 : 0.38) + routine.clipPhaseOffset,
      true,
      Object.freeze({
        conversationId: routine.conversationId,
        anchorId: routine.anchor.anchorId,
        partnerActorId: routine.partnerActorId,
        side: routine.side
      })
    );
  }
  if (local >= conversationEnd && local < returnEnd) {
    const progress = 1 - easeInOutCubic(
      (local - conversationEnd) / INNER_KEEP_AMBIENT_CONVERSATION_TRAVEL_SECONDS
    );
    const sample = sampleInnerKeepPath(routine.route.path, progress);
    const partnerPosition = routine.anchor.meetingPositions[
      routine.side === 0 ? 1 : 0
    ];
    const meetingYaw = yawToward(sample.position, partnerPosition);
    const meetingBlend = Math.max(0, Math.min(1, (progress - 0.35) / 0.65));
    return poseFromSample(
      routine,
      sample,
      blendYaw(oppositeYaw(sample.yawRadians), meetingYaw, meetingBlend),
      'walk',
      'Walk',
      (routine.route.path.totalLength - sample.distance) * 1.45
        + routine.clipPhaseOffset,
      true,
      null
    );
  }
  const sample = sampleInnerKeepPath(routine.route.path, 0);
  const beforeDeparture = local < outboundStart;
  return poseFromSample(
    routine,
    sample,
    sample.yawRadians,
    beforeDeparture ? 'work' : 'idle',
    beforeDeparture ? 'Work' : 'Idle',
    local * (beforeDeparture ? 0.52 : 0.34) + routine.clipPhaseOffset,
    true,
    null
  );
}

function sampleLoopRoutine(
  routine: InnerKeepLoopRoutine,
  elapsedSeconds: number
): InnerKeepAmbientActorPose {
  const local = positiveModulo(
    elapsedSeconds + routine.phaseOffsetSeconds,
    routine.cycleDurationSeconds
  );
  const walking = local < routine.travelDurationSeconds;
  const groupProgress = walking ? local / routine.travelDurationSeconds : 0;
  const progress = wrapInnerKeepUnitProgress(
    groupProgress + routine.staticProgress
  );
  const sample = sampleInnerKeepPath(routine.route.path, progress);
  return poseFromSample(
    routine,
    sample,
    sample.yawRadians,
    walking ? 'walk' : 'idle',
    walking ? 'Walk' : 'Idle',
    walking
      ? (
          local * routine.speedMetersPerSecond
          + routine.staticProgress * routine.route.path.totalLength
        ) * (routine.actor.mounted ? 1.12 : 1.48)
        + routine.clipPhaseOffset
      : (local - routine.travelDurationSeconds) * 0.36 + routine.clipPhaseOffset,
    true,
    null
  );
}

function sampleRawInnerKeepAmbientActorPose(
  plan: InnerKeepAmbientSimulationPlan,
  routine: InnerKeepAmbientActorRoutine,
  elapsedSeconds: number
): InnerKeepAmbientActorPose {
  if (!plan.motionEnabled) return staticPose(routine);
  const time = finiteElapsedSeconds(elapsedSeconds);
  return routine.kind === 'conversation'
    ? sampleConversationRoutine(routine, time)
    : sampleLoopRoutine(routine, time);
}

/**
 * Stateless clip continuity. The transition boundary is recovered from the
 * closed-form timeline itself, so backward seeks and skipped frames produce
 * exactly the same two clip samples and weights as forward playback.
 */
export function sampleInnerKeepAmbientActorPose(
  plan: InnerKeepAmbientSimulationPlan,
  routine: InnerKeepAmbientActorRoutine,
  elapsedSeconds: number
): InnerKeepAmbientActorPose {
  const time = finiteElapsedSeconds(elapsedSeconds);
  const pose = sampleRawInnerKeepAmbientActorPose(plan, routine, time);
  if (!pose.animated || time <= 0) return pose;
  const historyStart = Math.max(0, time - INNER_KEEP_AMBIENT_CLIP_BLEND_SECONDS);
  const historyPose = sampleRawInnerKeepAmbientActorPose(
    plan,
    routine,
    historyStart
  );
  if (historyPose.clipName === pose.clipName) return pose;

  let sourceTime = historyStart;
  let targetTime = time;
  let sourcePose = historyPose;
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const middleTime = (sourceTime + targetTime) * 0.5;
    const middlePose = sampleRawInnerKeepAmbientActorPose(
      plan,
      routine,
      middleTime
    );
    if (middlePose.clipName === pose.clipName) {
      targetTime = middleTime;
    } else {
      sourceTime = middleTime;
      sourcePose = middlePose;
    }
  }
  const progress = smoothStep(
    (time - targetTime) / INNER_KEEP_AMBIENT_CLIP_BLEND_SECONDS
  );
  return Object.freeze({
    ...pose,
    clipBlend: Object.freeze({
      fromClipName: sourcePose.clipName,
      fromClipPhase: sourcePose.clipPhase,
      progress
    })
  });
}

/**
 * Closed-form frame sampling: callers may seek forward or backward arbitrarily
 * and receive the same pose for the same plan and timestamp.
 */
export function sampleInnerKeepAmbientFrame(
  plan: InnerKeepAmbientSimulationPlan,
  elapsedSeconds: number
): InnerKeepAmbientFrame {
  const sampleSeconds = plan.motionEnabled ? finiteElapsedSeconds(elapsedSeconds) : 0;
  const actors = Object.freeze(plan.routines.map((routine) => (
    sampleInnerKeepAmbientActorPose(plan, routine, sampleSeconds)
  )));
  const conversationIds = new Set(actors.flatMap((pose) => (
    pose.conversation ? [pose.conversation.conversationId] : []
  )));
  return Object.freeze({
    sampleSeconds,
    animationFrameCap: plan.animationFrameCap,
    animationActive: plan.motionEnabled && actors.length > 0,
    presentationOnly: true,
    gameplayAuthorityClaimed: false,
    actors,
    activeConversationCount: conversationIds.size,
    animatedActorCount: actors.filter(({ animated }) => animated).length,
    mountedActorCount: actors.filter(({ mounted }) => mounted).length,
    patrolUnitCount: actors.filter(({ presentationRole }) => (
      presentationRole === 'ceremonial-patrol'
    )).length
  });
}
