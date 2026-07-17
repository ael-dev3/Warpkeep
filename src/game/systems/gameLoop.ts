import {
  BUILDING_LABELS,
  REGION_NAMES,
  STARTING_BUILDINGS,
  STARTING_RESOURCES,
  UNIT_COSTS,
  UNIT_TRAINING_SECONDS
} from '../constants/gameConstants';
import type {
  ActivityLogEntry,
  Building,
  BuildingType,
  FarcasterIdentity,
  GameState,
  NearbyCastle,
  ResourceState,
  ScoutReport,
  UnitType
} from '../models/types';
import { normalizePublicProfileText } from '../../security/publicProfileText';

const emptyResources = (): ResourceState => ({ grain: 0, stone: 0, iron: 0, influence: 0 });
const RESOURCE_KEYS = ['grain', 'stone', 'iron', 'influence'] as const;

function safeElapsedMinutes(value: number) {
  if (!Number.isFinite(value) || value < 0) return undefined;
  const normalized = Math.floor(value);
  return Number.isSafeInteger(normalized) ? normalized : undefined;
}

function safeNonNegativeInteger(value: number, allowZero = true) {
  return Number.isSafeInteger(value) && value >= 0 && (allowZero || value > 0)
    ? value
    : undefined;
}

function safeTimestamp(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function resourcesAreSafe(value: ResourceState) {
  return RESOURCE_KEYS.every((key) => (
    Number.isSafeInteger(value[key]) && value[key] >= 0
  ));
}

function safeResourceResult(value: ResourceState) {
  return resourcesAreSafe(value) ? value : undefined;
}

const titleCaseHandle = (handle: string): string => {
  const cleaned = handle.replace(/^@/, '').trim();
  if (!cleaned) return 'Unknown';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const MAX_ID_PART_LENGTH = 96;
const MAX_ID_PARTS = 8;

const idFor = (...parts: Array<string | number>): string => parts
  .slice(0, MAX_ID_PARTS)
  .map((part, index) => {
    const rawPart = String(part);
    if (rawPart.length === 0 || rawPart.length > MAX_ID_PART_LENGTH) return `invalid-${index}`;
    return rawPart
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || `unknown-${index}`;
  })
  .join('-');

const safeIdentityHandle = (value: unknown, fid: number) => {
  const normalized = normalizePublicProfileText(value, 64)?.replace(/^@/, '').trim();
  return normalized || `fid-${fid}`;
};

const addResources = (a: ResourceState, b: ResourceState): ResourceState | undefined => safeResourceResult({
  grain: a.grain + b.grain,
  stone: a.stone + b.stone,
  iron: a.iron + b.iron,
  influence: a.influence + b.influence
});

const subtractResources = (a: ResourceState, b: ResourceState): ResourceState | undefined => safeResourceResult({
  grain: a.grain - b.grain,
  stone: a.stone - b.stone,
  iron: a.iron - b.iron,
  influence: a.influence - b.influence
});

const multiplyResources = (cost: ResourceState, quantity: number): ResourceState | undefined => safeResourceResult({
  grain: cost.grain * quantity,
  stone: cost.stone * quantity,
  iron: cost.iron * quantity,
  influence: cost.influence * quantity
});

const canAfford = (resources: ResourceState, cost: ResourceState): boolean =>
  resourcesAreSafe(resources) &&
  resourcesAreSafe(cost) &&
  resources.grain >= cost.grain &&
  resources.stone >= cost.stone &&
  resources.iron >= cost.iron &&
  resources.influence >= cost.influence;

const prependLog = (state: GameState, eventType: string, message: string, createdAt = 0): ActivityLogEntry[] => [
  {
    id: idFor(state.castle.id, eventType, createdAt, state.activityLog.length + 1),
    castleId: state.castle.id,
    eventType,
    message,
    createdAt
  },
  ...state.activityLog
];

const cloneState = (state: GameState): GameState => ({
  ...state,
  player: { ...state.player },
  castle: { ...state.castle },
  resources: { ...state.resources },
  buildings: state.buildings.map((building) => ({ ...building })),
  constructionQueue: state.constructionQueue.map((item) => ({ ...item })),
  trainingQueue: state.trainingQueue.map((item) => ({ ...item })),
  unitStacks: state.unitStacks.map((stack) => ({ ...stack })),
  nearbyCastles: state.nearbyCastles.map((castle) => ({ ...castle })),
  activityLog: state.activityLog.map((entry) => ({ ...entry })),
  scoutReports: state.scoutReports.map((report) => ({ ...report }))
});

export const getBuildingLevel = (state: GameState, buildingType: BuildingType): number =>
  safeNonNegativeInteger(
    state.buildings.find((building) => building.type === buildingType)?.level ?? 0
  ) ?? 0;

export const getConstructionCost = (buildingType: BuildingType, targetLevel: number): ResourceState => {
  const safeTargetLevel = safeNonNegativeInteger(targetLevel, false);
  if (safeTargetLevel === undefined) {
    throw new RangeError('Construction target level must be a positive safe integer.');
  }
  let cost: ResourceState;
  switch (buildingType) {
    case 'keep':
      cost = { grain: 30 * safeTargetLevel, stone: 50 * safeTargetLevel, iron: 10 * safeTargetLevel, influence: 5 * safeTargetLevel };
      break;
    case 'farm':
      cost = { grain: 10 * safeTargetLevel, stone: 25 + 5 * safeTargetLevel, iron: 0, influence: 0 };
      break;
    case 'quarry':
      cost = { grain: 20 * safeTargetLevel, stone: 15 * safeTargetLevel, iron: 5 * safeTargetLevel, influence: 0 };
      break;
    case 'barracks':
      cost = { grain: 35 * safeTargetLevel, stone: 35 * safeTargetLevel, iron: 15 * safeTargetLevel, influence: 3 * safeTargetLevel };
      break;
    case 'watchtower':
      cost = { grain: 20 * safeTargetLevel, stone: 40 * safeTargetLevel, iron: 15 * safeTargetLevel, influence: 2 * safeTargetLevel };
      break;
  }
  const safeCost = safeResourceResult(cost);
  if (!safeCost) throw new RangeError('Construction cost exceeds the safe resource range.');
  return safeCost;
};

function hasSafeConstructionCost(buildingType: BuildingType, targetLevel: number) {
  try {
    getConstructionCost(buildingType, targetLevel);
    return true;
  } catch {
    return false;
  }
}

export const createCastleForFid = (identity: FarcasterIdentity): GameState => {
  if (!Number.isSafeInteger(identity.fid) || identity.fid <= 0) {
    throw new RangeError('A positive safe Farcaster FID is required.');
  }
  const cleanHandle = safeIdentityHandle(identity.handle, identity.fid);
  const playerId = idFor('player', identity.fid);
  const castleId = idFor('castle', identity.fid);
  const region = REGION_NAMES[identity.fid % REGION_NAMES.length];

  const buildings: Building[] = STARTING_BUILDINGS.map((type) => ({
    id: idFor(castleId, type),
    castleId,
    type,
    level: 1
  }));

  return {
    player: {
      id: playerId,
      fid: identity.fid,
      handle: cleanHandle,
      pfpUrl: identity.pfpUrl,
      createdAt: 0,
      lastSeenAt: 0
    },
    castle: {
      id: castleId,
      playerId,
      name: `${titleCaseHandle(cleanHandle)} Keep`,
      level: 1,
      region,
      x: identity.fid % 97,
      y: Math.floor(identity.fid / 97) % 97,
      createdAt: 0
    },
    resources: { ...STARTING_RESOURCES },
    buildings,
    constructionQueue: [],
    trainingQueue: [],
    unitStacks: [
      { id: idFor(castleId, 'unit', 'scout'), castleId, unitType: 'scout', quantity: 2 },
      { id: idFor(castleId, 'unit', 'guard'), castleId, unitType: 'guard', quantity: 5 },
      { id: idFor(castleId, 'unit', 'raider'), castleId, unitType: 'raider', quantity: 0 }
    ],
    nearbyCastles: [],
    activityLog: [
      {
        id: idFor(castleId, 'court-awaits'),
        castleId,
        eventType: 'court_idle',
        message: 'The court awaits your next order.',
        createdAt: 0
      },
      {
        id: idFor(castleId, 'scouts-spotted'),
        castleId,
        eventType: 'scout_hint',
        message: 'Your scouts spotted a nearby castle.',
        createdAt: 0
      },
      {
        id: idFor(castleId, 'quarry-produced'),
        castleId,
        eventType: 'resource_hint',
        message: 'The quarry produced stone.',
        createdAt: 0
      },
      {
        id: idFor(castleId, 'farmers-delivered'),
        castleId,
        eventType: 'resource_hint',
        message: 'Your farmers delivered grain.',
        createdAt: 0
      }
    ],
    scoutReports: []
  };
};

export const collectResources = (state: GameState, elapsedMinutes: number): GameState => {
  const next = cloneState(state);
  const safeMinutes = safeElapsedMinutes(elapsedMinutes);
  if (safeMinutes === undefined || !resourcesAreSafe(next.resources)) return next;
  const farmLevel = getBuildingLevel(state, 'farm');
  const quarryLevel = getBuildingLevel(state, 'quarry');
  const watchtowerLevel = getBuildingLevel(state, 'watchtower');
  const keepLevel = getBuildingLevel(state, 'keep');
  const produced: ResourceState = {
    grain: farmLevel * safeMinutes,
    stone: Math.floor(quarryLevel * safeMinutes * 0.6),
    iron: Math.floor(watchtowerLevel * safeMinutes * 0.2),
    influence: Math.floor((keepLevel * safeMinutes) / 60)
  };
  const nextResources = addResources(next.resources, produced);
  if (!resourcesAreSafe(produced) || !nextResources) return next;
  next.resources = nextResources;
  next.activityLog = prependLog(
    next,
    'collect_resources',
    `Your farmers delivered ${produced.grain} grain, the quarry cut ${produced.stone} stone, and the watchtower recovered ${produced.iron} iron.`,
    safeMinutes
  );
  return next;
};

export const startBuildingUpgrade = (state: GameState, buildingType: BuildingType, startedAt: number): GameState => {
  const next = cloneState(state);
  const safeStartedAt = safeTimestamp(startedAt);
  if (safeStartedAt === undefined || !resourcesAreSafe(next.resources)) return next;
  const queueLimit = Math.max(1, getBuildingLevel(next, 'keep'));
  if (next.constructionQueue.length >= queueLimit) {
    next.activityLog = prependLog(next, 'queue_blocked', 'The masons are already committed to another order.', safeStartedAt);
    return next;
  }

  const currentLevel = getBuildingLevel(next, buildingType);
  const targetLevel = safeNonNegativeInteger(currentLevel + 1, false);
  if (targetLevel === undefined) return next;
  const pendingUpgrade = next.constructionQueue.find((item) => item.buildingType === buildingType);
  if (pendingUpgrade) {
    next.activityLog = prependLog(next, 'upgrade_blocked', `${BUILDING_LABELS[buildingType]} already has an upgrade pending.`, safeStartedAt);
    return next;
  }

  let cost: ResourceState;
  try {
    cost = getConstructionCost(buildingType, targetLevel);
  } catch {
    return next;
  }
  if (!canAfford(next.resources, cost)) {
    next.activityLog = prependLog(next, 'upgrade_blocked', `Not enough resources to raise the ${BUILDING_LABELS[buildingType]}.`, safeStartedAt);
    return next;
  }

  const remainingResources = subtractResources(next.resources, cost);
  const completesAt = safeStartedAt + targetLevel * 30;
  if (!remainingResources || !Number.isSafeInteger(completesAt)) return next;
  next.resources = remainingResources;
  next.constructionQueue = [
    ...next.constructionQueue,
    {
      id: idFor(next.castle.id, 'build', buildingType, targetLevel, safeStartedAt),
      castleId: next.castle.id,
      buildingType,
      targetLevel,
      startedAt: safeStartedAt,
      completesAt
    }
  ];
  next.activityLog = prependLog(next, 'start_building_upgrade', `Masons began raising the ${BUILDING_LABELS[buildingType]} to level ${targetLevel}.`, safeStartedAt);
  return next;
};

export const startUnitTraining = (state: GameState, unitType: UnitType, quantity: number, startedAt: number): GameState => {
  const next = cloneState(state);
  const safeQuantity = safeNonNegativeInteger(quantity, false);
  const safeStartedAt = safeTimestamp(startedAt);
  if (
    safeQuantity === undefined
    || safeStartedAt === undefined
    || !resourcesAreSafe(next.resources)
  ) return next;
  const cost = multiplyResources(UNIT_COSTS[unitType], safeQuantity);
  if (!cost) return next;
  const barracksLevel = getBuildingLevel(next, 'barracks');

  if (barracksLevel < 1) {
    next.activityLog = prependLog(next, 'training_blocked', 'A barracks must stand before the realm can train units.', safeStartedAt);
    return next;
  }

  if (!canAfford(next.resources, cost)) {
    next.activityLog = prependLog(next, 'training_blocked', `Not enough resources to train ${safeQuantity} ${unitType}.`, safeStartedAt);
    return next;
  }

  const remainingResources = subtractResources(next.resources, cost);
  const completesAt = safeStartedAt + UNIT_TRAINING_SECONDS[unitType] * safeQuantity;
  if (!remainingResources || !Number.isSafeInteger(completesAt)) return next;
  next.resources = remainingResources;
  next.trainingQueue = [
    ...next.trainingQueue,
    {
      id: idFor(next.castle.id, 'train', unitType, safeQuantity, safeStartedAt),
      castleId: next.castle.id,
      unitType,
      quantity: safeQuantity,
      startedAt: safeStartedAt,
      completesAt
    }
  ];
  next.activityLog = prependLog(next, 'start_unit_training', `The barracks began training ${safeQuantity} ${unitType}${safeQuantity === 1 ? '' : 's'}.`, safeStartedAt);
  return next;
};

export const scoutNearbyCastle = (state: GameState, target: NearbyCastle): ScoutReport => {
  if (
    safeNonNegativeInteger(target.fid, false) === undefined
    || safeNonNegativeInteger(target.level) === undefined
    || !Number.isFinite(target.distance)
    || target.distance < 0
  ) {
    throw new RangeError('A scout target requires safe identity, level, and distance values.');
  }
  const keepLevel = getBuildingLevel(state, 'keep');
  const targetHandle = safeIdentityHandle(target.handle, target.fid);
  const risk: ScoutReport['risk'] = target.distance <= 5 && target.level <= keepLevel + 1 ? 'low' : target.level > keepLevel + 2 ? 'guarded' : 'unknown';

  return {
    id: idFor(state.castle.id, 'scout', target.fid),
    sourceCastleId: state.castle.id,
    targetFid: target.fid,
    targetHandle,
    risk,
    summary: `Scouts returned from @${targetHandle}: level ${target.level} keep, ${target.distance} leagues away. Combat resolution is not enabled yet.`,
    canRaid: false,
    createdAt: 0
  };
};

export const recordScoutReport = (state: GameState, target: NearbyCastle): GameState => {
  const next = cloneState(state);
  const report = scoutNearbyCastle(next, target);
  next.scoutReports = [report, ...next.scoutReports.filter((existing) => existing.targetFid !== target.fid)];
  next.activityLog = prependLog(next, 'scout_castle', report.summary, report.createdAt);
  return next;
};

export const completeReadyConstruction = (state: GameState, now: number): GameState => {
  const next = cloneState(state);
  const safeNow = safeTimestamp(now);
  if (
    safeNow === undefined
    || next.constructionQueue.some((item) => (
      safeTimestamp(item.startedAt) === undefined
      || safeTimestamp(item.completesAt) === undefined
      || safeNonNegativeInteger(item.targetLevel, false) === undefined
      || !hasSafeConstructionCost(item.buildingType, item.targetLevel)
    ))
  ) return next;
  const ready = next.constructionQueue.filter((item) => item.completesAt <= safeNow);
  if (ready.length === 0) return next;

  next.buildings = next.buildings.map((building) => {
    const upgrade = ready.find((item) => item.buildingType === building.type);
    return upgrade ? { ...building, level: upgrade.targetLevel } : building;
  });
  next.castle.level = getBuildingLevel(next, 'keep');
  next.constructionQueue = next.constructionQueue.filter((item) => item.completesAt > safeNow);
  next.activityLog = ready.reduce(
    (logs, item) => [
      {
        id: idFor(next.castle.id, 'complete', item.buildingType, item.targetLevel, safeNow),
        castleId: next.castle.id,
        eventType: 'complete_building_upgrade',
        message: `${BUILDING_LABELS[item.buildingType]} reached level ${item.targetLevel}.`,
        createdAt: safeNow
      },
      ...logs
    ],
    next.activityLog
  );
  return next;
};

export const completeReadyTraining = (state: GameState, now: number): GameState => {
  const next = cloneState(state);
  const safeNow = safeTimestamp(now);
  if (
    safeNow === undefined
    || next.trainingQueue.some((item) => (
      safeTimestamp(item.startedAt) === undefined
      || safeTimestamp(item.completesAt) === undefined
      || safeNonNegativeInteger(item.quantity, false) === undefined
    ))
    || next.unitStacks.some((stack) => safeNonNegativeInteger(stack.quantity) === undefined)
  ) return next;
  const ready = next.trainingQueue.filter((item) => item.completesAt <= safeNow);
  if (ready.length === 0) return next;

  const finalQuantities = new Map(next.unitStacks.map((stack) => [stack.unitType, stack.quantity]));
  for (const item of ready) {
    const quantity = (finalQuantities.get(item.unitType) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(quantity)) return next;
    finalQuantities.set(item.unitType, quantity);
  }

  for (const item of ready) {
    const stack = next.unitStacks.find((candidate) => candidate.unitType === item.unitType);
    if (stack) stack.quantity += item.quantity;
    else next.unitStacks.push({ id: idFor(next.castle.id, 'unit', item.unitType), castleId: next.castle.id, unitType: item.unitType, quantity: item.quantity });
  }
  next.trainingQueue = next.trainingQueue.filter((item) => item.completesAt > safeNow);
  next.activityLog = ready.reduce(
    (logs, item) => [
      {
        id: idFor(next.castle.id, 'training-complete', item.unitType, safeNow),
        castleId: next.castle.id,
        eventType: 'complete_unit_training',
        message: `${item.quantity} ${item.unitType}${item.quantity === 1 ? '' : 's'} joined the garrison.`,
        createdAt: safeNow
      },
      ...logs
    ],
    next.activityLog
  );
  return next;
};

export const resourceDeltaForPreview = (minutes: number, state: GameState): ResourceState => {
  const safeMinutes = safeElapsedMinutes(minutes);
  if (safeMinutes === undefined) return emptyResources();
  return safeResourceResult({
    grain: getBuildingLevel(state, 'farm') * safeMinutes,
    stone: Math.floor(getBuildingLevel(state, 'quarry') * safeMinutes * 0.6),
    iron: Math.floor(getBuildingLevel(state, 'watchtower') * safeMinutes * 0.2),
    influence: Math.floor((getBuildingLevel(state, 'keep') * safeMinutes) / 60)
  }) ?? emptyResources();
};

export const zeroResources = emptyResources;
