import type { BuildingType, ResourceState, UnitType } from '../models/types';

export const STARTING_RESOURCES: ResourceState = {
  grain: 120,
  stone: 90,
  iron: 40,
  influence: 10
};

export const STARTING_BUILDINGS: BuildingType[] = ['keep', 'farm', 'quarry', 'barracks', 'watchtower'];

export const BUILDING_LABELS: Record<BuildingType, string> = {
  keep: 'Keep',
  farm: 'Farm',
  quarry: 'Quarry',
  barracks: 'Barracks',
  watchtower: 'Watchtower'
};

export const BUILDING_DESCRIPTIONS: Record<BuildingType, string> = {
  keep: 'Seat of the court. Raises queue capacity and unlocks future systems.',
  farm: 'Feeds citizens and soldiers with steady grain production.',
  quarry: 'Cuts stone for walls, halls, banners, and future siegeworks.',
  barracks: 'Trains scouts, guards, and later raiding parties.',
  watchtower: 'Reads the realm through signal fires, ravens, and distant banners.'
};

export const UNIT_LABELS: Record<UnitType, string> = {
  scout: 'Scout',
  guard: 'Guard',
  raider: 'Raider'
};

export const UNIT_COSTS: Record<UnitType, ResourceState> = {
  scout: { grain: 10, stone: 0, iron: 5, influence: 1 },
  guard: { grain: 18, stone: 0, iron: 12, influence: 1 },
  raider: { grain: 24, stone: 0, iron: 18, influence: 2 }
};

export const UNIT_TRAINING_SECONDS: Record<UnitType, number> = {
  scout: 30,
  guard: 45,
  raider: 60
};

export const REGION_NAMES = ['North Signal', 'Ravenmere', 'Stonewake', 'Bannerglen', 'Mistcourt', 'Iron Vale'];
