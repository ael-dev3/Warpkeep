import { describe, expect, it } from 'vitest';

import {
  createRealmInteractionState,
  realmInteractionReducer,
  resolveRealmEscape
} from '../src/components/realm/realmInteractionState';

describe('realm interaction state', () => {
  it('starts with durable cell selection and no automatically opened inspector', () => {
    const state = createRealmInteractionState({ q: 2, r: -1 });

    expect(state).toEqual({
      selectedCell: { q: 2, r: -1 },
      selectedCastle: null,
      inspectorTarget: null,
      inspectorOpen: false,
      cameraTarget: { kind: 'realm' },
      navigatorOpen: false,
      keyboardIntent: { sequence: 0, target: { kind: 'map' } }
    });
    expect(Object.keys(state).some((key) => key.toLowerCase().includes('hover'))).toBe(false);
  });

  it('keeps a cell selection independent from an open castle inspector', () => {
    const initial = createRealmInteractionState({ q: 0, r: 0 });
    const castle = realmInteractionReducer(initial, {
      type: 'activate-castle',
      castleId: 7_001,
      coord: { q: 1, r: -2 }
    });
    const terrain = realmInteractionReducer(castle, {
      type: 'select-cell',
      coord: { q: -3, r: 2 }
    });

    expect(terrain.selectedCell).toEqual({ q: -3, r: 2 });
    expect(terrain.selectedCastle).toBeNull();
    expect(terrain.inspectorOpen).toBe(true);
    expect(terrain.inspectorTarget).toEqual({
      castleId: 7_001,
      coord: { q: 1, r: -2 }
    });
  });

  it('activates a castle explicitly and directs camera and keyboard intent to it', () => {
    const state = realmInteractionReducer(createRealmInteractionState({ q: 0, r: 0 }), {
      type: 'activate-castle',
      castleId: 42,
      coord: { q: 3, r: -1 }
    });

    expect(state.selectedCell).toEqual({ q: 3, r: -1 });
    expect(state.selectedCastle).toEqual({ castleId: 42, coord: { q: 3, r: -1 } });
    expect(state.inspectorTarget).toEqual({ castleId: 42, coord: { q: 3, r: -1 } });
    expect(state.inspectorOpen).toBe(true);
    expect(state.cameraTarget).toEqual({
      kind: 'castle',
      castleId: 42,
      coord: { q: 3, r: -1 }
    });
    expect(state.keyboardIntent).toEqual({
      sequence: 1,
      target: { kind: 'inspector', castleId: 42 }
    });
  });

  it('opens a public Gold-site inspector without turning the site into a castle or local authority', () => {
    const state = realmInteractionReducer(createRealmInteractionState({ q: 0, r: 0 }), {
      type: 'activate-gold-site',
      siteId: 'genesis-001:gold:0001',
      coord: { q: 4, r: -2 }
    });

    expect(state.selectedCell).toEqual({ q: 4, r: -2 });
    expect(state.selectedCastle).toBeNull();
    expect(state.inspectorTarget).toEqual({
      siteId: 'genesis-001:gold:0001',
      coord: { q: 4, r: -2 }
    });
    expect(state.cameraTarget).toEqual({ kind: 'cell', coord: { q: 4, r: -2 } });
    expect(state.keyboardIntent).toEqual({
      sequence: 1,
      target: { kind: 'gold-mine-inspector', siteId: 'genesis-001:gold:0001' }
    });
    expect(resolveRealmEscape(state).state.keyboardIntent.target).toEqual({ kind: 'map' });
  });

  it('opens a read-only water record and preserves its canonical body identity', () => {
    const state = realmInteractionReducer(createRealmInteractionState({ q: 0, r: 0 }), {
      type: 'activate-water-cell',
      cellKey: 'genesis-001:river:01:0001',
      bodyId: 'genesis-001:river:01',
      regime: 'river',
      coord: { q: 4, r: -2 }
    });

    expect(state.selectedCell).toEqual({ q: 4, r: -2 });
    expect(state.selectedCastle).toBeNull();
    expect(state.inspectorTarget).toEqual({
      cellKey: 'genesis-001:river:01:0001',
      bodyId: 'genesis-001:river:01',
      regime: 'river',
      coord: { q: 4, r: -2 }
    });
    expect(state.cameraTarget).toEqual({
      kind: 'water',
      cellKey: 'genesis-001:river:01:0001',
      coord: { q: 4, r: -2 }
    });
    expect(state.keyboardIntent).toEqual({
      sequence: 1,
      target: { kind: 'water-inspector', cellKey: 'genesis-001:river:01:0001' }
    });
  });

  it('opens a Food Farm inspector through a distinct target shape from Gold', () => {
    const state = realmInteractionReducer(createRealmInteractionState({ q: 0, r: 0 }), {
      type: 'activate-food-site',
      siteId: 'genesis-001:food:0001',
      coord: { q: -4, r: 3 }
    });

    expect(state.selectedCell).toEqual({ q: -4, r: 3 });
    expect(state.selectedCastle).toBeNull();
    expect(state.inspectorTarget).toEqual({
      foodSiteId: 'genesis-001:food:0001',
      coord: { q: -4, r: 3 }
    });
    expect(state.inspectorTarget).not.toHaveProperty('siteId');
    expect(state.keyboardIntent).toEqual({
      sequence: 1,
      target: { kind: 'food-farm-inspector', siteId: 'genesis-001:food:0001' }
    });
    expect(resolveRealmEscape(state).state.keyboardIntent.target).toEqual({ kind: 'map' });
  });

  it.each([
    'gold',
    'food',
    'wood',
    'stone'
  ] as const)('opens a moving %s wagon record without replacing durable camera intent', (resource) => {
    const camera = realmInteractionReducer(createRealmInteractionState({ q: 0, r: 0 }), {
      type: 'set-camera-target',
      target: { kind: 'castle', castleId: 77, coord: { q: 2, r: -1 } }
    });
    const shared = {
      siteId: `genesis-001:${resource}:0001`,
      coord: { q: 8, r: -3 },
      cameraIntent: 'preserve' as const
    };
    const state = resource === 'gold'
      ? realmInteractionReducer(camera, { type: 'activate-gold-site', ...shared })
      : resource === 'food'
        ? realmInteractionReducer(camera, { type: 'activate-food-site', ...shared })
        : resource === 'wood'
          ? realmInteractionReducer(camera, { type: 'activate-wood-site', ...shared })
          : realmInteractionReducer(camera, { type: 'activate-stone-site', ...shared });

    expect(state.inspectorOpen).toBe(true);
    expect(state.selectedCell).toEqual(shared.coord);
    expect(state.cameraTarget).toBe(camera.cameraTarget);
  });

  it('closes the inspector without erasing selection and can reopen the same castle', () => {
    const active = realmInteractionReducer(createRealmInteractionState({ q: 0, r: 0 }), {
      type: 'activate-castle',
      castleId: 7,
      coord: { q: -1, r: 1 }
    });
    const closed = realmInteractionReducer(active, { type: 'close-inspector' });

    expect(closed.inspectorOpen).toBe(false);
    expect(closed.selectedCell).toEqual(active.selectedCell);
    expect(closed.selectedCastle).toEqual(active.selectedCastle);
    expect(closed.inspectorTarget).toEqual(active.inspectorTarget);
    expect(closed.cameraTarget).toEqual(active.cameraTarget);
    expect(closed.keyboardIntent).toEqual({
      sequence: 2,
      target: { kind: 'castle-label', castleId: 7 }
    });

    const reopened = realmInteractionReducer(closed, {
      type: 'activate-castle',
      castleId: 7,
      coord: { q: -1, r: 1 }
    });
    expect(reopened.inspectorOpen).toBe(true);
    expect(reopened.inspectorTarget).toEqual(active.inspectorTarget);
    expect(reopened.keyboardIntent).toEqual({
      sequence: 3,
      target: { kind: 'inspector', castleId: 7 }
    });
  });

  it('resolves Escape by closing the inspector before requesting realm exit', () => {
    const active = realmInteractionReducer(createRealmInteractionState({ q: 0, r: 0 }), {
      type: 'activate-castle',
      castleId: 9,
      coord: { q: 0, r: 1 }
    });
    const firstEscape = resolveRealmEscape(active);

    expect(firstEscape.decision).toBe('close-inspector');
    expect(firstEscape.state.inspectorOpen).toBe(false);
    expect(firstEscape.state.selectedCastle).toEqual(active.selectedCastle);

    const secondEscape = resolveRealmEscape(firstEscape.state);
    expect(secondEscape.decision).toBe('request-exit');
    expect(secondEscape.state).toBe(firstEscape.state);
  });

  it('closes an open navigator before requesting exit and restores trigger focus intent', () => {
    const initial = createRealmInteractionState({ q: 0, r: 0 });
    const open = realmInteractionReducer(initial, { type: 'open-navigator' });

    expect(open.navigatorOpen).toBe(true);
    expect(open.keyboardIntent).toEqual({ sequence: 1, target: { kind: 'navigator' } });

    const firstEscape = resolveRealmEscape(open);
    expect(firstEscape.decision).toBe('close-navigator');
    expect(firstEscape.state.navigatorOpen).toBe(false);
    expect(firstEscape.state.keyboardIntent).toEqual({
      sequence: 2,
      target: { kind: 'navigator-trigger' }
    });
    expect(resolveRealmEscape(firstEscape.state).decision).toBe('request-exit');
  });

  it('never leaves the inspector and navigator open together', () => {
    const inspector = realmInteractionReducer(createRealmInteractionState({ q: 0, r: 0 }), {
      type: 'activate-castle',
      castleId: 9,
      coord: { q: 1, r: -1 }
    });
    const navigator = realmInteractionReducer(inspector, { type: 'open-navigator' });

    expect(navigator.inspectorOpen).toBe(false);
    expect(navigator.navigatorOpen).toBe(true);
    expect(resolveRealmEscape(navigator).decision).toBe('close-navigator');
  });

  it('recenters on the keep without leaving a stale castle record open', () => {
    const active = realmInteractionReducer(createRealmInteractionState({ q: 0, r: 0 }), {
      type: 'activate-castle',
      castleId: 9,
      coord: { q: 2, r: -1 }
    });
    const recentered = realmInteractionReducer(active, {
      type: 'recenter-keep',
      coord: { q: 0, r: 0 }
    });

    expect(recentered.selectedCell).toEqual({ q: 0, r: 0 });
    expect(recentered.selectedCastle).toBeNull();
    expect(recentered.inspectorOpen).toBe(false);
    expect(recentered.cameraTarget).toEqual({ kind: 'keep' });
    expect(recentered.keyboardIntent).toEqual({
      sequence: 2,
      target: { kind: 'navigator-trigger' }
    });
  });

  it('models camera and repeated keyboard focus requests without DOM references', () => {
    const initial = createRealmInteractionState({ q: 0, r: 0 });
    const camera = realmInteractionReducer(initial, {
      type: 'set-camera-target',
      target: { kind: 'cell', coord: { q: 4, r: -4 } }
    });
    const firstFocus = realmInteractionReducer(camera, { type: 'request-map-focus' });
    const secondFocus = realmInteractionReducer(firstFocus, { type: 'request-map-focus' });

    expect(camera.cameraTarget).toEqual({ kind: 'cell', coord: { q: 4, r: -4 } });
    expect(secondFocus.keyboardIntent).toEqual({ sequence: 2, target: { kind: 'map' } });
  });

  it('retains a pending castle-label focus intent for asynchronous label reveal', () => {
    const initial = createRealmInteractionState({ q: 0, r: 0 });
    const focused = realmInteractionReducer(initial, {
      type: 'request-castle-label-focus',
      castleId: 77
    });

    expect(focused.keyboardIntent).toEqual({
      sequence: 1,
      target: { kind: 'castle-label', castleId: 77 }
    });
    expect(focused.cameraTarget).toEqual({ kind: 'realm' });
  });

  it('retains semantic overview, district, and keep camera targets for scene restoration', () => {
    const initial = createRealmInteractionState({ q: 0, r: 0 });
    const district = realmInteractionReducer(initial, {
      type: 'set-camera-target',
      target: { kind: 'founding-district' }
    });
    const keep = realmInteractionReducer(district, {
      type: 'set-camera-target',
      target: { kind: 'keep' }
    });
    const realm = realmInteractionReducer(keep, {
      type: 'set-camera-target',
      target: { kind: 'realm' }
    });

    expect(district.cameraTarget).toEqual({ kind: 'founding-district' });
    expect(keep.cameraTarget).toEqual({ kind: 'keep' });
    expect(realm.cameraTarget).toEqual({ kind: 'realm' });
  });

});
