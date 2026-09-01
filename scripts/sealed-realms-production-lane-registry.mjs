const LANE_KINDS = Object.freeze(['g001', 'g002', 'ptr', 'activation']);
const lanes = new WeakMap();

export class SealedRealmsProductionLaneRegistryError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionLaneRegistryError';
    this.code = code;
  }
}

function fail() {
  throw new SealedRealmsProductionLaneRegistryError(
    'SEALED_REALMS_LANE_REGISTRY_CAPABILITY_INVALID',
  );
}

function exactKind(kind) {
  if (!LANE_KINDS.includes(kind)) fail();
  return kind;
}

/**
 * Internal graph-local enrollment used only at the existing lane construction
 * sites. Workflow entry and dispatcher surfaces never receive a registrar.
 */
export function registerSealedRealmsProductionLane(lane, kind) {
  exactKind(kind);
  if (
    lane === null
    || typeof lane !== 'object'
    || Array.isArray(lane)
    || Object.getPrototypeOf(lane) !== Object.prototype
    || !Object.isFrozen(lane)
    || JSON.stringify(Reflect.ownKeys(lane)) !== JSON.stringify(['execute'])
    || typeof lane.execute !== 'function'
    || lanes.has(lane)
  ) fail();
  lanes.set(lane, kind);
  return lane;
}

/** Asserts both the opaque graph-local brand and its fixed dispatcher slot. */
export function assertSealedRealmsProductionLane(lane, kind) {
  if (lanes.get(lane) !== exactKind(kind)) fail();
  return lane;
}
