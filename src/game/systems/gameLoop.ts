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

const emptyResources = (): ResourceState => ({ grain: 0, stone: 0, iron: 0, influence: 0 });

const titleCaseHandle = (handle: string): string => {
  const cleaned = handle.replace(/^@/, '').trim();
  if (!cleaned) return 'Unknown';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const idFor = (...parts: Array<string | number>): string => parts.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '-');

const addResources = (a: ResourceState, b: ResourceState): ResourceState => ({
  grain: a.grain + b.grain,
  stone: a.stone + b.stone,
  iron: a.iron + b.iron,
  influence: a.influence + b.influence
});

const subtractResources = (a: ResourceState, b: ResourceState): ResourceState => ({
  grain: a.grain - b.grain,
  stone: a.stone - b.stone,
  iron: a.iron - b.iron,
  influence: a.influence - b.influence
});

const multiplyResources = (cost: ResourceState, quantity: number): ResourceState => ({
  grain: cost.grain * quantity,
  stone: cost.stone * quantity,
  iron: cost.iron * quantity,
  influence: cost.influence * quantity
});

const canAfford = (resources: ResourceState, cost: ResourceState): boolean =>
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
  state.buildings.find((building) => building.type === buildingType)?.level ?? 0;

export const getConstructionCost = (buildingType: BuildingType, targetLevel: number): ResourceState => {
  switch (buildingType) {
    case 'keep':
      return { grain: 30 * targetLevel, stone: 50 * targetLevel, iron: 10 * targetLevel, influence: 5 * targetLevel };
    case 'farm':
      return { grain: 10 * targetLevel, stone: 25 + 5 * targetLevel, iron: 0, influence: 0 };
    case 'quarry':
      return { grain: 20 * targetLevel, stone: 15 * targetLevel, iron: 5 * targetLevel, influence: 0 };
    case 'barracks':
      return { grain: 35 * targetLevel, stone: 35 * targetLevel, iron: 15 * targetLevel, influence: 3 * targetLevel };
    case 'watchtower':
      return { grain: 20 * targetLevel, stone: 40 * targetLevel, iron: 15 * targetLevel, influence: 2 * targetLevel };
  }
};

export const createCastleForFid = (identity: FarcasterIdentity): GameState => {
  const cleanHandle = identity.handle.replace(/^@/, '').trim() || `fid-${identity.fid}`;
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
  const safeMinutes = Math.max(0, Math.floor(elapsedMinutes));
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
  const next = cloneState(state);
  next.resources = addResources(next.resources, produced);
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
  const queueLimit = Math.max(1, getBuildingLevel(next, 'keep'));
  if (next.constructionQueue.length >= queueLimit) {
    next.activityLog = prependLog(next, 'queue_blocked', 'The masons are already committed to another order.', startedAt);
    return next;
  }

  const currentLevel = getBuildingLevel(next, buildingType);
  const targetLevel = currentLevel + 1;
  const cost = getConstructionCost(buildingType, targetLevel);
  if (!canAfford(next.resources, cost)) {
    next.activityLog = prependLog(next, 'upgrade_blocked', `Not enough resources to raise the ${BUILDING_LABELS[buildingType]}.`, startedAt);
    return next;
  }

  next.resources = subtractResources(next.resources, cost);
  next.constructionQueue = [
    ...next.constructionQueue,
    {
      id: idFor(next.castle.id, 'build', buildingType, targetLevel, startedAt),
      castleId: next.castle.id,
      buildingType,
      targetLevel,
      startedAt,
      completesAt: startedAt + targetLevel * 30
    }
  ];
  next.activityLog = prependLog(next, 'start_building_upgrade', `Masons began raising the ${BUILDING_LABELS[buildingType]} to level ${targetLevel}.`, startedAt);
  return next;
};

export const startUnitTraining = (state: GameState, unitType: UnitType, quantity: number, startedAt: number): GameState => {
  const next = cloneState(state);
  const safeQuantity = Math.max(1, Math.floor(quantity));
  const cost = multiplyResources(UNIT_COSTS[unitType], safeQuantity);
  const barracksLevel = getBuildingLevel(next, 'barracks');

  if (barracksLevel < 1) {
    next.activityLog = prependLog(next, 'training_blocked', 'A barracks must stand before the realm can train units.', startedAt);
    return next;
  }

  if (!canAfford(next.resources, cost)) {
    next.activityLog = prependLog(next, 'training_blocked', `Not enough resources to train ${safeQuantity} ${unitType}.`, startedAt);
    return next;
  }

  next.resources = subtractResources(next.resources, cost);
  next.trainingQueue = [
    ...next.trainingQueue,
    {
      id: idFor(next.castle.id, 'train', unitType, safeQuantity, startedAt),
      castleId: next.castle.id,
      unitType,
      quantity: safeQuantity,
      startedAt,
      completesAt: startedAt + UNIT_TRAINING_SECONDS[unitType] * safeQuantity
    }
  ];
  next.activityLog = prependLog(next, 'start_unit_training', `The barracks began training ${safeQuantity} ${unitType}${safeQuantity === 1 ? '' : 's'}.`, startedAt);
  return next;
};

export const scoutNearbyCastle = (state: GameState, target: NearbyCastle): ScoutReport => {
  const keepLevel = getBuildingLevel(state, 'keep');
  const risk: ScoutReport['risk'] = target.distance <= 5 && target.level <= keepLevel + 1 ? 'low' : target.level > keepLevel + 2 ? 'guarded' : 'unknown';

  return {
    id: idFor(state.castle.id, 'scout', target.fid),
    sourceCastleId: state.castle.id,
    targetFid: target.fid,
    targetHandle: target.handle,
    risk,
    summary: `Scouts returned from @${target.handle}: level ${target.level} keep, ${target.distance} leagues away. Combat resolution is not enabled yet.`,
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
  const ready = next.constructionQueue.filter((item) => item.completesAt <= now);
  if (ready.length === 0) return next;

  next.buildings = next.buildings.map((building) => {
    const upgrade = ready.find((item) => item.buildingType === building.type);
    return upgrade ? { ...building, level: upgrade.targetLevel } : building;
  });
  next.castle.level = getBuildingLevel(next, 'keep');
  next.constructionQueue = next.constructionQueue.filter((item) => item.completesAt > now);
  next.activityLog = ready.reduce(
    (logs, item) => [
      {
        id: idFor(next.castle.id, 'complete', item.buildingType, item.targetLevel, now),
        castleId: next.castle.id,
        eventType: 'complete_building_upgrade',
        message: `${BUILDING_LABELS[item.buildingType]} reached level ${item.targetLevel}.`,
        createdAt: now
      },
      ...logs
    ],
    next.activityLog
  );
  return next;
};

export const completeReadyTraining = (state: GameState, now: number): GameState => {
  const next = cloneState(state);
  const ready = next.trainingQueue.filter((item) => item.completesAt <= now);
  if (ready.length === 0) return next;

  for (const item of ready) {
    const stack = next.unitStacks.find((candidate) => candidate.unitType === item.unitType);
    if (stack) stack.quantity += item.quantity;
    else next.unitStacks.push({ id: idFor(next.castle.id, 'unit', item.unitType), castleId: next.castle.id, unitType: item.unitType, quantity: item.quantity });
  }
  next.trainingQueue = next.trainingQueue.filter((item) => item.completesAt > now);
  next.activityLog = ready.reduce(
    (logs, item) => [
      {
        id: idFor(next.castle.id, 'training-complete', item.unitType, now),
        castleId: next.castle.id,
        eventType: 'complete_unit_training',
        message: `${item.quantity} ${item.unitType}${item.quantity === 1 ? '' : 's'} joined the garrison.`,
        createdAt: now
      },
      ...logs
    ],
    next.activityLog
  );
  return next;
};

export const resourceDeltaForPreview = (minutes: number, state: GameState): ResourceState => {
  const safeMinutes = Math.max(0, Math.floor(minutes));
  return {
    grain: getBuildingLevel(state, 'farm') * safeMinutes,
    stone: Math.floor(getBuildingLevel(state, 'quarry') * safeMinutes * 0.6),
    iron: Math.floor(getBuildingLevel(state, 'watchtower') * safeMinutes * 0.2),
    influence: Math.floor((getBuildingLevel(state, 'keep') * safeMinutes) / 60)
  };
};

export const zeroResources = emptyResources;
