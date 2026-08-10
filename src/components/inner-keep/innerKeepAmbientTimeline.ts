import {
  INNER_KEEP_AMBIENT_QUALITY_BUDGETS,
  INNER_KEEP_CITIZEN_WORK_ROUTES,
  INNER_KEEP_CIVIC_MOUNTED_ROUTES,
  INNER_KEEP_CONVERSATION_ANCHORS,
  INNER_KEEP_FOOT_DUTY_ROUTES,
  INNER_KEEP_MOUNTED_DUTY_ROUTES,
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
export const INNER_KEEP_AMBIENT_ENDPOINT_TURN_SECONDS = 0.55;

export type InnerKeepAmbientBehavior =
  | 'walk'
  | 'idle'
  | 'greet'
  | 'work'
  | 'stand-watch'
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

export type InnerKeepShuttleRoutine = Readonly<{
  kind: 'shuttle';
  actor: InnerKeepAmbientActorCatalogEntry;
  route: InnerKeepAmbientRoute;
  speedMetersPerSecond: number;
  travelDurationSeconds: number;
  homeDwellDurationSeconds: number;
  destinationDwellDurationSeconds: number;
  cycleDurationSeconds: number;
  phaseOffsetSeconds: number;
  staticProgress: 0 | 1;
  endpointBehavior: 'work' | 'stand-watch';
  endpointClip: 'Work' | 'Idle';
  clipPhaseOffset: number;
  footprintHalfExtentsMeters: InnerKeepAmbientFootprintHalfExtents;
}>;

export type InnerKeepAmbientActorRoutine =
  | InnerKeepConversationRoutine
  | InnerKeepShuttleRoutine;

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
  routePurpose: InnerKeepAmbientRoute['purpose'];
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

function shuttleRoutine(
  seed: number,
  quality: InnerKeepAmbientQuality,
  actor: InnerKeepAmbientActorCatalogEntry,
  route: InnerKeepAmbientRoute
): InnerKeepShuttleRoutine {
  if (route.path.closed) {
    throw new Error(`Inner Keep shuttle ${route.routeId} requires an open path.`);
  }
  const civic = actor.presentationRole === 'civic-routine';
  const civicMounted = actor.category === 'civic-mounted';
  const minimumSpeed = civicMounted ? 0.8 : civic ? 0.68 : 0.72;
  const maximumSpeed = civicMounted ? 0.96 : civic ? 0.88 : 0.84;
  const speedMetersPerSecond = minimumSpeed
    + (maximumSpeed - minimumSpeed) * innerKeepAmbientDeterministicUnit(
      seed,
      actor.actorId,
      'shuttle-speed'
    );
  const travelDurationSeconds = route.path.totalLength / speedMetersPerSecond;
  const minimumDwellSeconds = civicMounted ? 10 : civic ? 8 : 6;
  const dwellRangeSeconds = civicMounted ? 12 : civic ? 10 : 8;
  const homeDwellDurationSeconds = minimumDwellSeconds
    + dwellRangeSeconds * innerKeepAmbientDeterministicUnit(
      seed,
      actor.actorId,
      'shuttle-home-dwell'
    );
  const destinationDwellDurationSeconds = minimumDwellSeconds
    + dwellRangeSeconds * innerKeepAmbientDeterministicUnit(
      seed,
      actor.actorId,
      'shuttle-destination-dwell'
    );
  const cycleDurationSeconds = travelDurationSeconds * 2
    + homeDwellDurationSeconds
    + destinationDwellDurationSeconds;
  return Object.freeze({
    kind: 'shuttle',
    actor,
    route,
    speedMetersPerSecond,
    travelDurationSeconds,
    homeDwellDurationSeconds,
    destinationDwellDurationSeconds,
    cycleDurationSeconds,
    phaseOffsetSeconds: innerKeepAmbientDeterministicUnit(
      seed,
      actor.actorId,
      'shuttle-cycle-offset'
    ) * cycleDurationSeconds,
    staticProgress: innerKeepAmbientDeterministicUnit(
      seed,
      actor.actorId,
      'shuttle-static-endpoint'
    ) < 0.5 ? 0 : 1,
    endpointBehavior: civic ? 'work' : 'stand-watch',
    endpointClip: civic ? 'Work' : 'Idle',
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
  const rankedConversationAnchors = rankedAnchors(seed);
  const villageAnchor = INNER_KEEP_CONVERSATION_ANCHORS.find(({ anchorId }) => (
    anchorId === 'east-village-commons'
  ));
  const anchors = villageAnchor && options.quality !== 'reduced'
    ? Object.freeze([
        villageAnchor,
        ...rankedConversationAnchors.filter(({ anchorId }) => (
          anchorId !== villageAnchor.anchorId
        ))
      ])
    : rankedConversationAnchors;
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
  const mountedPatrol = selection.actors.filter(({ category }) => (
    category === 'mounted-patrol'
  ));
  if (unpairedCitizens.length > INNER_KEEP_CITIZEN_WORK_ROUTES.length) {
    throw new Error('Inner Keep citizen work routes cannot cover the selected actors.');
  }
  unpairedCitizens.forEach((actor, index) => {
    routineByActorId.set(actor.actorId, shuttleRoutine(
      seed,
      options.quality,
      actor,
      INNER_KEEP_CITIZEN_WORK_ROUTES[index]!
    ));
  });
  if (footPatrol.length > INNER_KEEP_FOOT_DUTY_ROUTES.length) {
    throw new Error('Inner Keep foot-duty routes cannot cover the selected actors.');
  }
  footPatrol.forEach((actor, index) => {
    routineByActorId.set(actor.actorId, shuttleRoutine(
      seed,
      options.quality,
      actor,
      INNER_KEEP_FOOT_DUTY_ROUTES[index]!
    ));
  });
  const civicRouteByActorId = new Map([
    ['emberfoot-courier', INNER_KEEP_CIVIC_MOUNTED_ROUTES[0]!],
    ['shellback-shrine-tender', INNER_KEEP_CIVIC_MOUNTED_ROUTES[1]!]
  ]);
  civicMounted.forEach((actor) => {
    const route = civicRouteByActorId.get(actor.actorId);
    if (!route) throw new Error(`Inner Keep civic mount ${actor.actorId} has no village route.`);
    routineByActorId.set(actor.actorId, shuttleRoutine(
      seed,
      options.quality,
      actor,
      route
    ));
  });
  if (mountedPatrol.length > INNER_KEEP_MOUNTED_DUTY_ROUTES.length) {
    throw new Error('Inner Keep mounted-duty routes cannot cover the selected actors.');
  }
  mountedPatrol.forEach((actor, index) => {
    routineByActorId.set(actor.actorId, shuttleRoutine(
      seed,
      options.quality,
      actor,
      INNER_KEEP_MOUNTED_DUTY_ROUTES[index]!
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
    routePurpose: routine.route.purpose,
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

function sampleShuttleRoutine(
  routine: InnerKeepShuttleRoutine,
  elapsedSeconds: number
): InnerKeepAmbientActorPose {
  const local = positiveModulo(
    elapsedSeconds + routine.phaseOffsetSeconds,
    routine.cycleDurationSeconds
  );
  const outboundStart = routine.homeDwellDurationSeconds;
  const destinationStart = outboundStart + routine.travelDurationSeconds;
  const returnStart = destinationStart + routine.destinationDwellDurationSeconds;

  if (local < outboundStart) {
    const sample = sampleInnerKeepPath(routine.route.path, 0);
    return poseFromSample(
      routine,
      sample,
      blendYaw(
        oppositeYaw(sample.yawRadians),
        sample.yawRadians,
        local / INNER_KEEP_AMBIENT_ENDPOINT_TURN_SECONDS
      ),
      routine.endpointBehavior,
      routine.endpointClip,
      local * 0.42 + routine.clipPhaseOffset,
      true,
      null
    );
  }
  if (local < destinationStart) {
    const travelSeconds = local - outboundStart;
    const sample = sampleInnerKeepPath(
      routine.route.path,
      travelSeconds / routine.travelDurationSeconds
    );
    return poseFromSample(
      routine,
      sample,
      sample.yawRadians,
      'walk',
      'Walk',
      sample.distance * 1.48 + routine.clipPhaseOffset,
      true,
      null
    );
  }
  if (local < returnStart) {
    const dwellSeconds = local - destinationStart;
    const sample = sampleInnerKeepPath(routine.route.path, 1);
    return poseFromSample(
      routine,
      sample,
      blendYaw(
        sample.yawRadians,
        oppositeYaw(sample.yawRadians),
        (
          dwellSeconds
          - routine.destinationDwellDurationSeconds
          + INNER_KEEP_AMBIENT_ENDPOINT_TURN_SECONDS
        ) / INNER_KEEP_AMBIENT_ENDPOINT_TURN_SECONDS
      ),
      routine.endpointBehavior,
      routine.endpointClip,
      dwellSeconds * 0.42 + routine.clipPhaseOffset,
      true,
      null
    );
  }
  const returnSeconds = local - returnStart;
  const sample = sampleInnerKeepPath(
    routine.route.path,
    1 - returnSeconds / routine.travelDurationSeconds
  );
  return poseFromSample(
    routine,
    sample,
    oppositeYaw(sample.yawRadians),
    'walk',
    'Walk',
    (routine.route.path.totalLength - sample.distance) * 1.48
      + routine.clipPhaseOffset,
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
  if (routine.kind === 'conversation') {
    return sampleConversationRoutine(routine, time);
  }
  return sampleShuttleRoutine(routine, time);
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
