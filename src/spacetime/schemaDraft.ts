export const spacetimeTables = [
  'Player',
  'Castle',
  'ResourceState',
  'Building',
  'ConstructionQueue',
  'UnitStack',
  'TrainingQueue',
  'ActivityLog',
  'ScoutReport',
  'Alliance',
  'Season',
  'WorldEvent'
] as const;

export const spacetimeReducers = [
  'collect_resources',
  'start_building_upgrade',
  'complete_building_upgrade',
  'start_unit_training',
  'complete_unit_training',
  'scout_castle',
  'create_alliance',
  'join_alliance',
  'declare_raid',
  'resolve_raid'
] as const;

export const spacetimeSubscriptions = [
  'own castle and queues by authenticated player id',
  'nearby castles derived from castle coordinates or social graph',
  'alliance events for joined alliances',
  'activity logs for the player castle and public realm events'
] as const;
