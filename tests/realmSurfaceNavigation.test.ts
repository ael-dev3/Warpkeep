import { describe, expect, it } from 'vitest';

import {
  REALM_SURFACE_MAX_DEPTH,
  popRealmSurfaceRoute,
  pushRealmSurfaceRoute,
  readRealmSurfaceHistoryState,
  readRealmSurfaceRoute,
  replaceRealmSurfaceRoute
} from '../src/components/realm/realmSurfaceNavigation';
import {
  realmSurfacePresentation,
  resolveRealmChromeMode,
  resolveRealmChromeModeFromViewport
} from '../src/components/realm/realmChromePresentation';

describe('Realm surface navigation', () => {
  it('accepts only bounded public route identifiers', () => {
    expect(readRealmSurfaceRoute({ kind: 'keep', castleId: 4 })).toEqual({
      kind: 'keep',
      castleId: 4
    });
    expect(readRealmSurfaceRoute({
      kind: 'resource-site',
      resource: 'food',
      siteId: 'genesis-001:food:0001'
    })).toEqual({
      kind: 'resource-site',
      resource: 'food',
      siteId: 'genesis-001:food:0001'
    });
    expect(readRealmSurfaceRoute({
      kind: 'worker',
      workerId: 'valid-worker',
      accessToken: 'private'
    })).toBeUndefined();
    expect(readRealmSurfaceRoute({
      kind: 'worker',
      workerId: 'x'.repeat(161)
    })).toBeUndefined();
    expect(readRealmSurfaceRoute({ kind: 'keep', castleId: 0 })).toBeUndefined();
    expect(readRealmSurfaceRoute({ kind: 'inner-keep' })).toEqual({
      kind: 'inner-keep'
    });
    expect(readRealmSurfaceRoute({ kind: 'inner-keep-catalogue' })).toEqual({
      kind: 'inner-keep-catalogue'
    });
    expect(readRealmSurfaceRoute({
      kind: 'inner-keep-placement',
      buildingKind: 'city-mill'
    })).toEqual({
      kind: 'inner-keep-placement',
      buildingKind: 'city-mill'
    });
    expect(readRealmSurfaceRoute({
      kind: 'inner-keep-building',
      buildingKind: 'city-mill'
    })).toEqual({
      kind: 'inner-keep-building',
      buildingKind: 'city-mill'
    });
    expect(readRealmSurfaceRoute({
      kind: 'inner-keep-slot',
      slotId: 'inner-keep-slot-m01',
    })).toBeUndefined();
    expect(readRealmSurfaceRoute({
      kind: 'inner-keep-placement',
      buildingKind: 'city-mill',
      cost: 300
    })).toBeUndefined();
    expect(readRealmSurfaceRoute({
      kind: 'inner-keep-building',
      buildingKind: '../private'
    })).toBeUndefined();
    expect(readRealmSurfaceRoute({
      kind: 'resource-balance',
      resource: 'ether'
    })).toBeUndefined();
  });

  it('deduplicates, bounds, replaces, and pops routes predictably', () => {
    const commands = pushRealmSurfaceRoute([], { kind: 'commands' });
    expect(pushRealmSurfaceRoute(commands, { kind: 'commands' })).toBe(commands);
    const workers = pushRealmSurfaceRoute(commands, { kind: 'workers' });
    expect(workers).toEqual([{ kind: 'commands' }, { kind: 'workers' }]);
    expect(replaceRealmSurfaceRoute(workers, {
      kind: 'worker',
      workerId: 'worker-01'
    })).toEqual([
      { kind: 'commands' },
      { kind: 'worker', workerId: 'worker-01' }
    ]);
    expect(popRealmSurfaceRoute(workers)).toEqual([{ kind: 'commands' }]);

    let bounded = workers;
    for (let index = 0; index < REALM_SURFACE_MAX_DEPTH + 4; index += 1) {
      bounded = pushRealmSurfaceRoute(bounded, {
        kind: 'worker',
        workerId: `worker-${index}`
      });
    }
    expect(bounded).toHaveLength(REALM_SURFACE_MAX_DEPTH);
  });

  it('restores only an exact same-session history envelope', () => {
    const valid = {
      version: 1,
      session: 'realm-session-1',
      stack: [{ kind: 'commands' }, { kind: 'workers' }]
    };
    expect(readRealmSurfaceHistoryState(valid, 'realm-session-1')).toEqual(valid);
    expect(readRealmSurfaceHistoryState(valid, 'another-session')).toBeUndefined();
    expect(readRealmSurfaceHistoryState({
      ...valid,
      token: 'private'
    }, 'realm-session-1')).toBeUndefined();
  });
});

describe('Realm chrome presentation', () => {
  it('always uses the hosted destination model in a verified Mini App', () => {
    const mode = resolveRealmChromeMode({
      miniApp: true,
      width: 1_440,
      height: 1_000,
      coarsePointer: false
    });
    expect(mode).toBe('miniapp');
    expect(realmSurfacePresentation(mode)).toBe('fullscreen-destination');
  });

  it('keeps ordinary wide web as a drawer and constrains small or short windows', () => {
    expect(resolveRealmChromeMode({
      miniApp: false,
      width: 1_280,
      height: 800,
      coarsePointer: false
    })).toBe('desktop-web');
    expect(resolveRealmChromeMode({
      miniApp: false,
      width: 390,
      height: 844,
      coarsePointer: true
    })).toBe('compact-web');
    expect(resolveRealmChromeMode({
      miniApp: false,
      width: 667,
      height: 375,
      coarsePointer: false
    })).toBe('compact-web');
  });

  it('does not change presentation mode for a software-keyboard viewport', () => {
    expect(resolveRealmChromeModeFromViewport({
      miniApp: false,
      width: 1_280,
      height: 430,
      layoutWidth: 1_280,
      layoutHeight: 800,
      coarsePointer: false
    })).toBe('desktop-web');

    expect(resolveRealmChromeModeFromViewport({
      miniApp: false,
      width: 667,
      height: 375,
      layoutWidth: 667,
      layoutHeight: 375,
      coarsePointer: false
    })).toBe('compact-web');

    expect(resolveRealmChromeModeFromViewport({
      miniApp: true,
      width: 1_280,
      height: 430,
      layoutWidth: 1_280,
      layoutHeight: 800,
      coarsePointer: false
    })).toBe('miniapp');
  });
});
