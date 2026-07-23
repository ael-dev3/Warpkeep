import type { HexCoord } from '../../game/map/hexCoordinates';

export type RealmCastleTarget = Readonly<{
  castleId: number;
  coord: HexCoord;
}>;

export type RealmWorkerTarget = Readonly<{
  workerId: string;
  workerOrdinal: number;
  originCastleId: number;
  coord: HexCoord;
}>;

/** A public world-site target; it contains no economy or authorization data. */
export type RealmGoldSiteTarget = Readonly<{
  siteId: string;
  coord: HexCoord;
}>;

/** Separate field prevents a Food site id from ever selecting a Gold panel. */
export type RealmFoodSiteTarget = Readonly<{
  foodSiteId: string;
  coord: HexCoord;
}>;

/** Separate field prevents a Wood site id from ever selecting another panel. */
export type RealmWoodSiteTarget = Readonly<{
  woodSiteId: string;
  coord: HexCoord;
}>;

/** Separate field prevents a Stone site id from selecting another panel. */
export type RealmStoneSiteTarget = Readonly<{
  stoneSiteId: string;
  coord: HexCoord;
}>;

export type RealmWaterCellTarget = Readonly<{
  cellKey: string;
  bodyId: string;
  regime: 'ocean' | 'river';
  coord: HexCoord;
}>;

export type RealmInspectorTarget =
  | RealmWorkerTarget
  | RealmCastleTarget
  | RealmGoldSiteTarget
  | RealmFoodSiteTarget
  | RealmWoodSiteTarget
  | RealmStoneSiteTarget
  | RealmWaterCellTarget;

export type RealmCameraTarget =
  | Readonly<{ kind: 'realm' }>
  | Readonly<{ kind: 'founding-district' }>
  | Readonly<{ kind: 'keep' }>
  | Readonly<{ kind: 'cell'; coord: HexCoord }>
  | Readonly<{ kind: 'castle'; castleId: number; coord: HexCoord }>;

export type RealmKeyboardTarget =
  | Readonly<{ kind: 'map' }>
  | Readonly<{ kind: 'inspector'; castleId: number }>
  | Readonly<{ kind: 'worker-inspector'; workerId: string }>
  | Readonly<{ kind: 'gold-mine-inspector'; siteId: string }>
  | Readonly<{ kind: 'food-farm-inspector'; siteId: string }>
  | Readonly<{ kind: 'logging-camp-inspector'; siteId: string }>
  | Readonly<{ kind: 'stone-quarry-inspector'; siteId: string }>
  | Readonly<{ kind: 'water-inspector'; cellKey: string }>
  | Readonly<{ kind: 'castle-label'; castleId: number }>
  | Readonly<{ kind: 'navigator' }>
  | Readonly<{ kind: 'navigator-trigger' }>;

/**
 * A sequence number makes repeated requests for the same focus target observable
 * without putting an HTMLElement in durable interaction state.
 */
export type RealmKeyboardIntent = Readonly<{
  sequence: number;
  target: RealmKeyboardTarget;
}>;

export type RealmInteractionState = Readonly<{
  selectedCell: HexCoord;
  selectedCastle: RealmCastleTarget | null;
  inspectorTarget: RealmInspectorTarget | null;
  inspectorOpen: boolean;
  cameraTarget: RealmCameraTarget;
  navigatorOpen: boolean;
  keyboardIntent: RealmKeyboardIntent;
}>;

export type RealmInteractionAction =
  | Readonly<{ type: 'select-cell'; coord: HexCoord }>
  | Readonly<{ type: 'activate-castle'; castleId: number; coord: HexCoord }>
  | Readonly<{ type: 'activate-worker'; workerId: string; workerOrdinal: number; originCastleId: number; coord: HexCoord }>
  | Readonly<{
      type: 'activate-gold-site';
      siteId: string;
      coord: HexCoord;
    }>
  | Readonly<{
      type: 'activate-food-site';
      siteId: string;
      coord: HexCoord;
    }>
  | Readonly<{
      type: 'activate-wood-site';
      siteId: string;
      coord: HexCoord;
    }>
  | Readonly<{
      type: 'activate-stone-site';
      siteId: string;
      coord: HexCoord;
    }>
  | Readonly<{
      type: 'activate-water-cell';
      cellKey: string;
      bodyId: string;
      regime: 'ocean' | 'river';
      coord: HexCoord;
    }>
  | Readonly<{ type: 'close-inspector' }>
  | Readonly<{ type: 'recenter-keep'; coord: HexCoord }>
  | Readonly<{ type: 'set-camera-target'; target: RealmCameraTarget }>
  | Readonly<{ type: 'open-navigator' }>
  | Readonly<{ type: 'close-navigator' }>
  | Readonly<{ type: 'request-castle-label-focus'; castleId: number }>
  | Readonly<{ type: 'request-map-focus' }>;

export type RealmEscapeDecision = 'close-inspector' | 'close-navigator' | 'request-exit';

export type RealmEscapeResult = Readonly<{
  decision: RealmEscapeDecision;
  state: RealmInteractionState;
}>;

function copyCoord(coord: HexCoord): HexCoord {
  return { q: coord.q, r: coord.r };
}

function copyCastleTarget(target: RealmCastleTarget): RealmCastleTarget {
  return { castleId: target.castleId, coord: copyCoord(target.coord) };
}

function copyWorkerTarget(target: RealmWorkerTarget): RealmWorkerTarget {
  return {
    workerId: target.workerId,
    workerOrdinal: target.workerOrdinal,
    originCastleId: target.originCastleId,
    coord: copyCoord(target.coord)
  };
}

function copyGoldSiteTarget(target: RealmGoldSiteTarget): RealmGoldSiteTarget {
  return { siteId: target.siteId, coord: copyCoord(target.coord) };
}

function copyFoodSiteTarget(target: RealmFoodSiteTarget): RealmFoodSiteTarget {
  return { foodSiteId: target.foodSiteId, coord: copyCoord(target.coord) };
}

function copyWoodSiteTarget(target: RealmWoodSiteTarget): RealmWoodSiteTarget {
  return { woodSiteId: target.woodSiteId, coord: copyCoord(target.coord) };
}

function copyStoneSiteTarget(target: RealmStoneSiteTarget): RealmStoneSiteTarget {
  return { stoneSiteId: target.stoneSiteId, coord: copyCoord(target.coord) };
}

function copyWaterCellTarget(target: RealmWaterCellTarget): RealmWaterCellTarget {
  return {
    cellKey: target.cellKey,
    bodyId: target.bodyId,
    regime: target.regime,
    coord: copyCoord(target.coord)
  };
}

function isCastleTarget(target: RealmInspectorTarget | null): target is RealmCastleTarget {
  return target !== null && 'castleId' in target;
}

function copyCameraTarget(target: RealmCameraTarget): RealmCameraTarget {
  if (target.kind === 'realm') return { kind: 'realm' };
  if (target.kind === 'founding-district') return { kind: 'founding-district' };
  if (target.kind === 'keep') return { kind: 'keep' };
  if (target.kind === 'cell') return { kind: 'cell', coord: copyCoord(target.coord) };
  return { kind: 'castle', castleId: target.castleId, coord: copyCoord(target.coord) };
}

function withKeyboardIntent(
  state: RealmInteractionState,
  target: RealmKeyboardTarget
): RealmKeyboardIntent {
  return { sequence: state.keyboardIntent.sequence + 1, target };
}

/**
 * Opens a passive world record without altering durable camera intent.
 * Resources, workers, and future inspectable units should use this boundary;
 * only explicit navigation actions are allowed to reframe the Realm.
 */
function activateCameraNeutralInspector(
  state: RealmInteractionState,
  target: Exclude<RealmInspectorTarget, RealmCastleTarget>,
  keyboardTarget: RealmKeyboardTarget
): RealmInteractionState {
  return {
    ...state,
    selectedCell: copyCoord(target.coord),
    selectedCastle: null,
    inspectorTarget: target,
    inspectorOpen: true,
    cameraTarget: state.cameraTarget,
    navigatorOpen: false,
    keyboardIntent: withKeyboardIntent(state, keyboardTarget)
  };
}

export function createRealmInteractionState(initialSelectedCell: HexCoord): RealmInteractionState {
  return {
    selectedCell: copyCoord(initialSelectedCell),
    selectedCastle: null,
    inspectorTarget: null,
    inspectorOpen: false,
    cameraTarget: { kind: 'realm' },
    navigatorOpen: false,
    keyboardIntent: { sequence: 0, target: { kind: 'map' } }
  };
}

/**
 * Durable interaction state only. Pointer hover remains transient presentation
 * state and deliberately has no field or action in this reducer.
 */
export function realmInteractionReducer(
  state: RealmInteractionState,
  action: RealmInteractionAction
): RealmInteractionState {
  switch (action.type) {
    case 'select-cell':
      return {
        ...state,
        selectedCell: copyCoord(action.coord),
        selectedCastle: null
      };

    case 'activate-castle': {
      const target = copyCastleTarget({ castleId: action.castleId, coord: action.coord });
      return {
        ...state,
        selectedCell: copyCoord(target.coord),
        selectedCastle: target,
        inspectorTarget: target,
        inspectorOpen: true,
        cameraTarget: { kind: 'castle', castleId: target.castleId, coord: copyCoord(target.coord) },
        navigatorOpen: false,
        keyboardIntent: withKeyboardIntent(state, {
          kind: 'inspector',
          castleId: target.castleId
        })
      };
    }

    case 'activate-worker': {
      const target = copyWorkerTarget(action);
      return activateCameraNeutralInspector(
        state,
        target,
        { kind: 'worker-inspector', workerId: target.workerId }
      );
    }

    case 'activate-gold-site': {
      const target = copyGoldSiteTarget({ siteId: action.siteId, coord: action.coord });
      return activateCameraNeutralInspector(
        state,
        target,
        {
          kind: 'gold-mine-inspector',
          siteId: target.siteId
        }
      );
    }

    case 'activate-food-site': {
      const target = copyFoodSiteTarget({ foodSiteId: action.siteId, coord: action.coord });
      return activateCameraNeutralInspector(
        state,
        target,
        {
          kind: 'food-farm-inspector',
          siteId: target.foodSiteId
        }
      );
    }

    case 'activate-wood-site': {
      const target = copyWoodSiteTarget({ woodSiteId: action.siteId, coord: action.coord });
      return activateCameraNeutralInspector(
        state,
        target,
        {
          kind: 'logging-camp-inspector',
          siteId: target.woodSiteId
        }
      );
    }

    case 'activate-stone-site': {
      const target = copyStoneSiteTarget({ stoneSiteId: action.siteId, coord: action.coord });
      return activateCameraNeutralInspector(
        state,
        target,
        {
          kind: 'stone-quarry-inspector',
          siteId: target.stoneSiteId
        }
      );
    }

    case 'activate-water-cell': {
      const target = copyWaterCellTarget(action);
      return activateCameraNeutralInspector(
        state,
        target,
        {
          kind: 'water-inspector',
          cellKey: target.cellKey
        }
      );
    }

    case 'close-inspector': {
      if (!state.inspectorOpen) return state;
      const castle = isCastleTarget(state.inspectorTarget)
        ? state.inspectorTarget
        : state.selectedCastle;
      return {
        ...state,
        inspectorOpen: false,
        keyboardIntent: withKeyboardIntent(
          state,
          castle
            ? { kind: 'castle-label', castleId: castle.castleId }
            : { kind: 'map' }
        )
      };
    }

    case 'recenter-keep':
      return {
        ...state,
        selectedCell: copyCoord(action.coord),
        selectedCastle: null,
        inspectorOpen: false,
        cameraTarget: { kind: 'keep' },
        navigatorOpen: false,
        keyboardIntent: withKeyboardIntent(state, { kind: 'navigator-trigger' })
      };

    case 'set-camera-target':
      return { ...state, cameraTarget: copyCameraTarget(action.target) };

    case 'open-navigator':
      return {
        ...state,
        inspectorOpen: false,
        navigatorOpen: true,
        keyboardIntent: withKeyboardIntent(state, { kind: 'navigator' })
      };

    case 'close-navigator':
      if (!state.navigatorOpen) return state;
      return {
        ...state,
        navigatorOpen: false,
        keyboardIntent: withKeyboardIntent(state, { kind: 'navigator-trigger' })
      };

    case 'request-castle-label-focus':
      return {
        ...state,
        keyboardIntent: withKeyboardIntent(state, {
          kind: 'castle-label',
          castleId: action.castleId
        })
      };

    case 'request-map-focus':
      return {
        ...state,
        keyboardIntent: withKeyboardIntent(state, { kind: 'map' })
      };
  }
}

/**
 * Resolves one Escape press without storing an exit request in durable state.
 * The caller owns the external exit side effect only when `request-exit` wins.
 */
export function resolveRealmEscape(state: RealmInteractionState): RealmEscapeResult {
  if (state.inspectorOpen) {
    return {
      decision: 'close-inspector',
      state: realmInteractionReducer(state, { type: 'close-inspector' })
    };
  }

  if (state.navigatorOpen) {
    return {
      decision: 'close-navigator',
      state: realmInteractionReducer(state, { type: 'close-navigator' })
    };
  }

  return { decision: 'request-exit', state };
}
