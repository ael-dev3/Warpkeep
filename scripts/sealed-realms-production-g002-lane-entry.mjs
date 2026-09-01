import {
  assertSealedRealmsProductionAuthBridgeState,
  assertSealedRealmsProductionAuthBridgeStateAuthority,
} from './sealed-realms-production-auth-bridge-state.mjs';
import {
  assertSealedRealmsProductionPublicationReconciler,
} from './sealed-realms-production-reconciliation.mjs';
import {
  preparationSourceCommitFromSealedRealmsProductionAuthority,
  sourceCommitFromSealedRealmsProductionAuthority,
} from './sealed-realms-production-source-authority.mjs';

const OPERATIONS = new Set([
  'g002-publish-inspect', 'g002-publish-apply', 'g002-import-inspect',
  'g002-import-apply', 'g002-live-inspect',
]);
const lanes = new WeakSet();

export class SealedRealmsProductionG002LaneError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionG002LaneError';
    this.code = code;
  }
}

function fail(code) { throw new SealedRealmsProductionG002LaneError(code); }

function record(value, code) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) fail(code);
  return value;
}

function confirmationInput(value, code) {
  const request = record(value, code);
  if (
    JSON.stringify(Object.keys(request)) !== JSON.stringify(['confirmation'])
    || request.confirmation === null || typeof request.confirmation !== 'object'
    || Array.isArray(request.confirmation)
    || Object.getPrototypeOf(request.confirmation) !== Object.prototype
    || Object.keys(request.confirmation).length !== 0
  ) fail(code);
  return request;
}

/** Owns only G002's receipt-derived marker and bridge-gate seams. */
export function createSealedRealmsProductionG002Lane(input) {
  const options = record(input, 'SEALED_REALMS_G002_LANE_INPUT_INVALID');
  const allowed = [
    'reconciler', 'bridgeState', 'createPublishMarker', 'publish', 'importCore', 'liveInspect',
  ];
  if (
    Object.keys(options).some(key => !allowed.includes(key))
    || typeof options.createPublishMarker !== 'function'
    || typeof options.publish !== 'function'
    || typeof options.importCore !== 'function'
    || typeof options.liveInspect !== 'function'
  ) fail('SEALED_REALMS_G002_LANE_INPUT_INVALID');
  const reconciler = assertSealedRealmsProductionPublicationReconciler(options.reconciler);
  const bridgeState = assertSealedRealmsProductionAuthBridgeState(options.bridgeState);

  const execute = async ({ operation, authority, input } = {}) => {
    if (!OPERATIONS.has(operation)) fail('SEALED_REALMS_G002_LANE_OPERATION_INVALID');
    const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(authority);
    const bridgeSourceCommit = preparationSourceCommitFromSealedRealmsProductionAuthority(authority);
    if (authority.operation !== operation) {
      fail('SEALED_REALMS_G002_LANE_SOURCE_OPERATION_INVALID');
    }
    assertSealedRealmsProductionAuthBridgeStateAuthority(bridgeState, authority);
    if (authority.mode !== 'S' && operation !== 'g002-live-inspect') {
      fail('SEALED_REALMS_G002_LANE_SOURCE_MODE_INVALID');
    }
    if (operation === 'g002-publish-inspect') {
      const marker = await options.createPublishMarker(Object.freeze({ sourceCommit }));
      const inspected = await reconciler.inspect({ marker });
      return inspected.confirmation === undefined
        ? Object.freeze({ status: 'publish-inspected' })
        : Object.freeze({ status: 'publish-inspected', confirmation: inspected.confirmation });
    }
    if (operation === 'g002-publish-apply') {
      const value = confirmationInput(input, 'SEALED_REALMS_G002_LANE_REQUEST_INVALID');
      const result = await reconciler.apply({
        confirmation: value.confirmation,
        publish: ({ confirmation }) => options.publish(Object.freeze({ sourceCommit, confirmation })),
      });
      return Object.freeze({ status: result.status });
    }
    if (operation === 'g002-import-inspect') {
      const result = await bridgeState.inspectGate({ lane: 'g002' });
      return Object.freeze({ status: 'import-inspected', confirmation: result.confirmation });
    }
    if (operation === 'g002-import-apply') {
      const value = confirmationInput(input, 'SEALED_REALMS_G002_LANE_REQUEST_INVALID');
      const result = await bridgeState.applyGate({
        confirmation: value.confirmation,
        apply: () => options.importCore(Object.freeze({ sourceCommit })),
      });
      return Object.freeze({ status: result.status });
    }
    await bridgeState.inspectLiveEvidence({
      lane: 'g002',
      inspect: () => options.liveInspect(Object.freeze({ sourceCommit: bridgeSourceCommit })),
    });
    return Object.freeze({ status: 'live-inspected' });
  };
  const lane = Object.freeze({ execute });
  lanes.add(lane);
  return lane;
}

export function assertSealedRealmsProductionG002Lane(lane) {
  if (!lanes.has(lane)) fail('SEALED_REALMS_G002_LANE_CAPABILITY_INVALID');
  return lane;
}
