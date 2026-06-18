export type ResourceKey = 'grain' | 'stone' | 'iron' | 'influence';
export type BuildingType = 'keep' | 'farm' | 'quarry' | 'barracks' | 'watchtower';
export type UnitType = 'scout' | 'guard' | 'raider';

export interface FarcasterIdentity {
  fid: number;
  handle: string;
  pfpUrl?: string;
}

export interface PlayerProfile extends FarcasterIdentity {
  id: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface CastleProfile {
  id: string;
  playerId: string;
  name: string;
  level: number;
  region: string;
  x: number;
  y: number;
  createdAt: number;
}

export interface ResourceState {
  grain: number;
  stone: number;
  iron: number;
  influence: number;
}

export interface Building {
  id: string;
  castleId: string;
  type: BuildingType;
  level: number;
}

export interface ConstructionQueueItem {
  id: string;
  castleId: string;
  buildingType: BuildingType;
  targetLevel: number;
  startedAt: number;
  completesAt: number;
}

export interface UnitStack {
  id: string;
  castleId: string;
  unitType: UnitType;
  quantity: number;
}

export interface TrainingQueueItem {
  id: string;
  castleId: string;
  unitType: UnitType;
  quantity: number;
  startedAt: number;
  completesAt: number;
}

export interface ActivityLogEntry {
  id: string;
  castleId: string;
  eventType: string;
  message: string;
  createdAt: number;
}

export interface NearbyCastle {
  fid: number;
  handle: string;
  level: number;
  distance: number;
  region?: string;
}

export interface ScoutReport {
  id: string;
  sourceCastleId: string;
  targetFid: number;
  targetHandle: string;
  risk: 'low' | 'guarded' | 'unknown';
  summary: string;
  canRaid: false;
  createdAt: number;
}

export interface GameState {
  player: PlayerProfile;
  castle: CastleProfile;
  resources: ResourceState;
  buildings: Building[];
  constructionQueue: ConstructionQueueItem[];
  trainingQueue: TrainingQueueItem[];
  unitStacks: UnitStack[];
  nearbyCastles: NearbyCastle[];
  activityLog: ActivityLogEntry[];
  scoutReports: ScoutReport[];
}
