import { describe, expect, it } from 'vitest';
import {
  collectResources,
  createCastleForFid,
  scoutNearbyCastle,
  startBuildingUpgrade,
  startUnitTraining
} from '../src/game/systems/gameLoop';

describe('Warpcastle deterministic game loop', () => {
  it('creates one stable starter castle profile for a Farcaster FID', () => {
    const castle = createCastleForFid({ fid: 777, handle: 'ael' });

    expect(castle.player.fid).toBe(777);
    expect(castle.player.handle).toBe('ael');
    expect(castle.castle.name).toBe('Ael Keep');
    expect(castle.resources).toMatchObject({ grain: 120, stone: 90, iron: 40, influence: 10 });
    expect(castle.buildings.map((building) => `${building.type}:${building.level}`)).toEqual([
      'keep:1',
      'farm:1',
      'quarry:1',
      'barracks:1',
      'watchtower:1'
    ]);
  });

  it('collects resources from building levels without random or AI mutation', () => {
    const castle = createCastleForFid({ fid: 101, handle: 'builder' });
    const next = collectResources(castle, 60);

    expect(next.resources).toEqual({ grain: 180, stone: 126, iron: 52, influence: 11 });
    expect(next.activityLog[0].message).toContain('farmers delivered 60 grain');
    expect(castle.resources).toEqual({ grain: 120, stone: 90, iron: 40, influence: 10 });
  });

  it('starts a building upgrade only when resources and queue space allow it', () => {
    const castle = createCastleForFid({ fid: 202, handle: 'mason' });
    const next = startBuildingUpgrade(castle, 'farm', 1_000);

    expect(next.resources.stone).toBe(55);
    expect(next.resources.grain).toBe(100);
    expect(next.constructionQueue).toHaveLength(1);
    expect(next.constructionQueue[0]).toMatchObject({ buildingType: 'farm', targetLevel: 2, startedAt: 1000, completesAt: 1060 });
  });

  it('blocks duplicate pending upgrades for the same building', () => {
    const castle = createCastleForFid({ fid: 222, handle: 'foreman' });
    const keep = castle.buildings.find((building) => building.type === 'keep');
    if (!keep) throw new Error('expected starter keep');
    keep.level = 2;
    castle.resources = { grain: 500, stone: 500, iron: 500, influence: 500 };

    const firstOrder = startBuildingUpgrade(castle, 'farm', 1_000);
    const secondOrder = startBuildingUpgrade(firstOrder, 'farm', 1_015);

    expect(secondOrder.constructionQueue).toHaveLength(1);
    expect(secondOrder.constructionQueue[0]).toMatchObject({ buildingType: 'farm', targetLevel: 2 });
    expect(secondOrder.resources).toEqual(firstOrder.resources);
    expect(secondOrder.activityLog[0].message).toContain('Farm already has an upgrade pending');
  });

  it('starts unit training from barracks with deterministic costs and timers', () => {
    const castle = createCastleForFid({ fid: 303, handle: 'captain' });
    const next = startUnitTraining(castle, 'scout', 3, 2_000);

    expect(next.resources).toMatchObject({ grain: 90, iron: 25, influence: 7 });
    expect(next.trainingQueue[0]).toMatchObject({ unitType: 'scout', quantity: 3, startedAt: 2000, completesAt: 2090 });
  });

  it('creates a scouting report without enabling combat resolution yet', () => {
    const castle = createCastleForFid({ fid: 404, handle: 'raven' });
    const report = scoutNearbyCastle(castle, { fid: 505, handle: 'nearby', level: 2, distance: 4 });

    expect(report.targetFid).toBe(505);
    expect(report.risk).toBe('low');
    expect(report.summary).toContain('@nearby');
    expect(report.canRaid).toBe(false);
  });
});
