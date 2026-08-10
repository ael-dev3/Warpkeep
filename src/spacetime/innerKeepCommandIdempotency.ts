import { SenderError } from 'spacetimedb';

import {
  INNER_KEEP_PROJECT_REVISION_MAX,
  type InnerKeepBuildingKind,
  type InnerKeepPlacementTransform,
  type InnerKeepResourceAmounts
} from '../components/inner-keep/innerKeepPresentation';
import { INNER_KEEP_POLICY_DIGEST } from '../../spacetimedb/src/innerKeepPolicy';
import { createExpeditionIdempotencyKey } from './expeditionIdempotencyKey';
import { WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION } from './warpkeepProtocol';

export const INNER_KEEP_REQUEST_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{15,79}$/;

export type InnerKeepCommandScope = Readonly<{
  generation: number;
  fid: number;
  castleId: bigint;
  backendProtocolVersion: number;
  layoutId: string;
  layoutVersion: number;
  policyVersion: string;
  policyDigest: string;
  layoutDigest: string;
  assetCatalogDigest: string;
  projectRevision: bigint;
}>;

export type InnerKeepCommandIntent = Readonly<{
  buildingKind: InnerKeepBuildingKind;
  placement: InnerKeepPlacementTransform;
  targetLevel: number;
  cost: InnerKeepResourceAmounts;
  durationMicros: bigint;
}>;

export type InnerKeepCommandAttemptPhase =
  | 'sending'
  | 'awaiting-authority'
  | 'ambiguous';

export type InnerKeepCommandAttempt = Readonly<{
  scope: InnerKeepCommandScope;
  intent: InnerKeepCommandIntent;
  fingerprint: string;
  requestKey: string;
  phase: InnerKeepCommandAttemptPhase;
}>;

export type InnerKeepRequestReceipt = Readonly<{
  found: true;
  castleId: bigint;
  buildingKey: string;
  buildingKind: InnerKeepBuildingKind;
  placement: InnerKeepPlacementTransform;
  targetLevel: number;
  deducted: InnerKeepResourceAmounts;
  startedAtMicros: bigint;
  policyVersion: string;
}> | Readonly<{ found: false }>;

export type InnerKeepReconciliationBuilding = Readonly<{
  castleId: bigint;
  buildingKey: string;
  buildingKind: InnerKeepBuildingKind;
  placement: InnerKeepPlacementTransform;
  completedLevel: number;
  targetLevel: number;
  phase: 'constructing' | 'complete';
  startedAtMicros: bigint;
  policyVersion: string;
}>;

export type InnerKeepDefinitiveRejection = Readonly<{
  code: string;
  statusMessage: string;
}>;

const INNER_KEEP_DEFINITIVE_REJECTION_MESSAGES = Object.freeze({
  INNER_KEEP_STATE_CHANGED: 'Inner Keep state changed. Review the refreshed quote before trying again.',
  INNER_KEEP_BUILDER_BUSY: 'The Builder is already working on another project.',
  INNER_KEEP_PLACEMENT_INVALID: 'That building location is not valid.',
  INNER_KEEP_PLACEMENT_OFF_GRID: 'That building must align to the town planning grid.',
  INNER_KEEP_PLACEMENT_ROTATION: 'Choose one of the four supported building orientations.',
  INNER_KEEP_PLACEMENT_OUTSIDE: 'That building must stay inside the town walls.',
  INNER_KEEP_PLACEMENT_RESERVED: 'That building would block a permanent road or civic space.',
  INNER_KEEP_PLACEMENT_OCCUPIED: 'That building would overlap another building.',
  INNER_KEEP_BUILDING_ALREADY_EXISTS: 'That unique building already occupies another site.',
  INNER_KEEP_MAXIMUM_LEVEL: 'That building has already reached Level 5.',
  INNER_KEEP_INSUFFICIENT_FOOD: 'There is not enough stored Food for this project.',
  INNER_KEEP_INSUFFICIENT_WOOD: 'There is not enough stored Wood for this project.',
  INNER_KEEP_INSUFFICIENT_STONE: 'There is not enough stored Stone for this project.',
  INNER_KEEP_INSUFFICIENT_GOLD: 'There is not enough stored Gold for this project.',
  INNER_KEEP_BACKEND_SYNCHRONIZING: 'Inner Keep construction is still synchronizing. No project was started.',
  INNER_KEEP_UNAVAILABLE: 'Inner Keep construction is currently unavailable.',
  INNER_KEEP_BUILDING_UNAVAILABLE: 'That building is currently unavailable.',
  AUTH_REQUIRED: 'Your Realm session changed. Reconnect before trying again.',
  INVALID_ISSUER: 'Your Realm session changed. Reconnect before trying again.',
  INVALID_AUDIENCE: 'Your Realm session changed. Reconnect before trying again.',
  INVALID_TOKEN_TYPE: 'Your Realm session changed. Reconnect before trying again.',
  INVALID_SUBJECT: 'Your Realm session changed. Reconnect before trying again.',
  INVALID_FID: 'Your Realm session changed. Reconnect before trying again.',
  INVALID_AUTH_VERSION: 'Your Realm session changed. Reconnect before trying again.',
  INVALID_AUTH_EPOCH: 'Your Realm session changed. Reconnect before trying again.',
  INVALID_ROLES: 'Your Realm session changed. Reconnect before trying again.',
  INVALID_PLAYER_SESSION: 'Your Realm session changed. Reconnect before trying again.',
  NOT_ADMITTED: 'Your Realm access changed. Reconnect before trying again.',
  AUTH_EPOCH_MISMATCH: 'Your Realm access changed. Reconnect before trying again.',
  PLAYER_NOT_BOOTSTRAPPED: 'Your castle is not ready for construction yet.',
  GENESIS_NOT_SEEDED: 'Your castle is not ready for construction yet.',
  IDENTITY_MISMATCH: 'Your Realm identity changed. Reconnect before trying again.',
  ALPHA_TERMS_REQUIRED: 'Accept the current Alpha Terms before starting construction.',
  INNER_KEEP_REQUEST_KEY_INVALID: 'The construction request could not be verified. No project was started.',
  INNER_KEEP_CASTLE_ID_INVALID: 'The construction request could not be verified. No project was started.',
  INNER_KEEP_FID_INVALID: 'The construction request could not be verified. No project was started.',
  INNER_KEEP_NOT_OWNED: 'Only your own castle can start this project.',
  INNER_KEEP_IDEMPOTENCY_CONFLICT: 'The construction request could not be verified. No project was started.',
  INNER_KEEP_IDEMPOTENCY_STALE: 'The construction request could not be verified. No project was started.',
  STATE_INTEGRITY: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_LAYOUT_INTEGRITY: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_CATALOG_INTEGRITY: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_BUILDER_MISSING: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_BUILDER_INTEGRITY: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_BUILDER_CONFLICT: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_BUILDING_LIMIT: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_BUILDING_INTEGRITY: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_BUILDING_KIND_INVALID: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_TARGET_LEVEL_INVALID: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_LEVEL_POLICY_MISSING: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_COMPLETED_LEVEL_INVALID: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_COST_OVERFLOW: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_COST_EXCEEDS_ACCOUNT_CAP: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_SCHEDULE_LIMIT: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_SCHEDULE_INTEGRITY: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_COMPLETION_INTEGRITY: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_COMPLETION_EARLY: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_CATALOG_CONFLICT: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_START_INTEGRITY: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_RECEIPT_INTEGRITY: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_RESOURCE_REVISION: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_BUILDING_REVISION: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_BUILDER_REVISION: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_TIME_OVERFLOW: 'Inner Keep state could not be verified. No project was started.',
  INNER_KEEP_REQUEST_FAILED: 'Inner Keep state could not be verified. No project was started.'
} as const satisfies Readonly<Record<string, string>>);

/**
 * Only an SDK SenderError with one exact reviewed code proves that the server
 * transaction rejected and rolled back. Timeouts, transport failures, plain
 * Errors, and unknown server copy remain commit-ambiguous and stay sealed.
 */
export function classifyInnerKeepDefinitiveRejection(
  error: unknown
): InnerKeepDefinitiveRejection | undefined {
  if (!(error instanceof SenderError)) return undefined;
  const code = error.message;
  if (!Object.prototype.hasOwnProperty.call(INNER_KEEP_DEFINITIVE_REJECTION_MESSAGES, code)) {
    return undefined;
  }
  return Object.freeze({
    code,
    statusMessage: INNER_KEEP_DEFINITIVE_REJECTION_MESSAGES[
      code as keyof typeof INNER_KEEP_DEFINITIVE_REJECTION_MESSAGES
    ]
  });
}

function validScope(scope: InnerKeepCommandScope) {
  return Number.isSafeInteger(scope.generation)
    && scope.generation > 0
    && Number.isSafeInteger(scope.fid)
    && scope.fid > 0
    && scope.castleId > 0n
    && scope.castleId <= (1n << 64n) - 1n
    && scope.backendProtocolVersion === WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
    && Number.isSafeInteger(scope.layoutVersion)
    && scope.layoutVersion > 0
    && scope.layoutId.length > 0
    && scope.policyVersion.length > 0
    && scope.policyDigest === INNER_KEEP_POLICY_DIGEST
    && /^[0-9a-f]{64}$/.test(scope.layoutDigest)
    && /^[0-9a-f]{64}$/.test(scope.assetCatalogDigest)
    && scope.projectRevision >= 0n
    && scope.projectRevision <= INNER_KEEP_PROJECT_REVISION_MAX;
}

export function serializeInnerKeepCommandFingerprint(
  scope: InnerKeepCommandScope,
  intent: InnerKeepCommandIntent
) {
  return [
    scope.generation,
    scope.fid,
    scope.castleId,
    scope.backendProtocolVersion,
    scope.layoutId,
    scope.layoutVersion,
    scope.policyVersion,
    scope.policyDigest,
    scope.layoutDigest,
    scope.assetCatalogDigest,
    scope.projectRevision,
    intent.buildingKind,
    intent.placement.localXMicrounits,
    intent.placement.localZMicrounits,
    intent.placement.rotationMilliDegrees,
    intent.targetLevel,
    intent.cost.food,
    intent.cost.wood,
    intent.cost.stone,
    intent.cost.gold,
    intent.durationMicros
  ].join('\u0000');
}

/**
 * Retain one request key only for the exact caller, connection generation,
 * public policy, castle lifecycle, placement, project, and authoritative quote.
 */
export function innerKeepCommandAttemptFor(
  retained: InnerKeepCommandAttempt | undefined,
  scope: InnerKeepCommandScope,
  intent: InnerKeepCommandIntent,
  createKey: () => string | undefined = createExpeditionIdempotencyKey
): InnerKeepCommandAttempt | undefined {
  if (
    !validScope(scope)
    || intent.placement.localXMicrounits % 500_000n !== 0n
    || intent.placement.localZMicrounits % 500_000n !== 0n
    || ![0, 90_000, 180_000, 270_000].includes(
      intent.placement.rotationMilliDegrees
    )
    || !Number.isSafeInteger(intent.targetLevel)
    || intent.targetLevel < 1
    || intent.targetLevel > 5
    || intent.durationMicros <= 0n
    || Object.values(intent.cost).some((amount) => amount < 0n)
  ) return undefined;
  const fingerprint = serializeInnerKeepCommandFingerprint(scope, intent);
  if (retained?.fingerprint === fingerprint) return retained;
  const requestKey = createKey();
  if (requestKey === undefined || !INNER_KEEP_REQUEST_KEY_PATTERN.test(requestKey)) {
    return undefined;
  }
  return Object.freeze({
    scope: Object.freeze({ ...scope }),
    intent: Object.freeze({
      ...intent,
      placement: Object.freeze({ ...intent.placement }),
      cost: Object.freeze({ ...intent.cost })
    }),
    fingerprint,
    requestKey,
    phase: 'sending' as const
  });
}

export function innerKeepCommandAttemptWithPhase(
  attempt: InnerKeepCommandAttempt,
  phase: InnerKeepCommandAttemptPhase
): InnerKeepCommandAttempt {
  return attempt.phase === phase ? attempt : Object.freeze({ ...attempt, phase });
}

/**
 * A receipt alone is private proof of deduction, while a public building row
 * alone cannot prove which request caused it. The receipt must agree exactly
 * with the attempt. The public building may either be that exact in-flight
 * project or a monotonic later state that proves the receipt target completed.
 */
export function reconcileInnerKeepCommandAttempt(
  attempt: InnerKeepCommandAttempt,
  receipt: InnerKeepRequestReceipt,
  buildings: readonly InnerKeepReconciliationBuilding[]
): 'pending' | 'confirmed' | 'conflict' {
  if (!receipt.found) return 'pending';
  const expectedBuildingKey = `${attempt.scope.castleId.toString()}:${attempt.intent.buildingKind}`;
  const exactReceipt = receipt.castleId === attempt.scope.castleId
    && receipt.buildingKey === expectedBuildingKey
    && receipt.buildingKind === attempt.intent.buildingKind
    && receipt.placement.localXMicrounits
      === attempt.intent.placement.localXMicrounits
    && receipt.placement.localZMicrounits
      === attempt.intent.placement.localZMicrounits
    && receipt.placement.rotationMilliDegrees
      === attempt.intent.placement.rotationMilliDegrees
    && receipt.targetLevel === attempt.intent.targetLevel
    && receipt.policyVersion === attempt.scope.policyVersion
    && receipt.deducted.food === attempt.intent.cost.food
    && receipt.deducted.wood === attempt.intent.cost.wood
    && receipt.deducted.stone === attempt.intent.cost.stone
    && receipt.deducted.gold === attempt.intent.cost.gold;
  if (!exactReceipt) return 'conflict';
  const matches = buildings.filter((building) => (
    building.castleId === receipt.castleId
    && building.buildingKey === receipt.buildingKey
    && building.buildingKind === receipt.buildingKind
    && building.placement.localXMicrounits
      === receipt.placement.localXMicrounits
    && building.placement.localZMicrounits
      === receipt.placement.localZMicrounits
    && building.placement.rotationMilliDegrees
      === receipt.placement.rotationMilliDegrees
    && building.policyVersion === receipt.policyVersion
    && (
      building.completedLevel >= receipt.targetLevel
      || (
        building.phase === 'constructing'
        && building.targetLevel === receipt.targetLevel
        && building.startedAtMicros === receipt.startedAtMicros
      )
    )
  ));
  return matches.length === 1 ? 'confirmed' : 'pending';
}
