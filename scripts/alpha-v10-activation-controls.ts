import {
  ALPHA_V10_ACTIVATION_COMPONENTS,
  ALPHA_V10_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
  type AlphaV10ActivationComponent,
} from '../spacetimedb/src/alphaV10ActivationPolicy';
import { WARPKEEP_BACKEND_PROTOCOL_VERSION } from '../spacetimedb/src/config';

export type AlphaStatusV10 = Readonly<{
  schemaProtocolVersion: number;
  backendProtocolVersion: number;
  waterPolicyVersion: string;
  waterLayoutVersion: number;
  canonicalWaterLayoutDigest: string;
  waterActivated: boolean;
  waterLayouts: bigint;
  canonicalWaterLayouts: bigint;
  waterBodies: bigint;
  canonicalWaterBodies: bigint;
  waterCells: bigint;
  canonicalWaterCells: bigint;
  realmEnvironments: bigint;
  canonicalRealmEnvironments: bigint;
  stoneSitePolicyVersion: string;
  stoneExpeditionPolicyVersion: string;
  canonicalStoneSiteCatalogDigest: string;
  stoneSites: bigint;
  canonicalStoneSites: bigint;
  stoneOccupations: bigint;
  stoneExpeditions: bigint;
  stoneIdempotencyReceipts: bigint;
  stoneSchedules: bigint;
}>;

export class AlphaV10ActivationControlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlphaV10ActivationControlError';
  }
}

const WATER_COUNT_FIELDS = Object.freeze([
  'waterLayouts',
  'canonicalWaterLayouts',
  'waterBodies',
  'canonicalWaterBodies',
  'waterCells',
  'canonicalWaterCells',
  'realmEnvironments',
  'canonicalRealmEnvironments',
] as const satisfies readonly (keyof AlphaStatusV10)[]);
const STONE_COUNT_FIELDS = Object.freeze([
  'stoneSites',
  'canonicalStoneSites',
  'stoneOccupations',
  'stoneExpeditions',
  'stoneIdempotencyReceipts',
  'stoneSchedules',
] as const satisfies readonly (keyof AlphaStatusV10)[]);
const COUNT_FIELDS = Object.freeze([...WATER_COUNT_FIELDS, ...STONE_COUNT_FIELDS]);

function fail(message: string): never {
  throw new AlphaV10ActivationControlError(message);
}

export function parseAlphaV10ActivationComponent(
  value: string | undefined,
): AlphaV10ActivationComponent {
  if (value === 'water' || value === 'stone') return value;
  return fail('Alpha v10 component must be one of: water, stone.');
}

function exactWaterReady(status: AlphaStatusV10): boolean {
  const water = ALPHA_V10_ACTIVATION_COMPONENTS.water;
  return status.waterLayouts === BigInt(water.layoutCount)
    && status.canonicalWaterLayouts === BigInt(water.layoutCount)
    && status.waterBodies === BigInt(water.bodyCount)
    && status.canonicalWaterBodies === BigInt(water.bodyCount)
    && status.waterCells === BigInt(water.cellCount)
    && status.canonicalWaterCells === BigInt(water.cellCount)
    && status.realmEnvironments === BigInt(water.environmentCount)
    && status.canonicalRealmEnvironments === BigInt(water.environmentCount);
}

function exactWaterEmpty(status: AlphaStatusV10): boolean {
  return WATER_COUNT_FIELDS.every(field => status[field] === 0n) && !status.waterActivated;
}

function exactStoneReady(status: AlphaStatusV10): boolean {
  const expected = BigInt(ALPHA_V10_ACTIVATION_COMPONENTS.stone.siteCount);
  return status.stoneSites === expected && status.canonicalStoneSites === expected;
}

function exactStoneEmpty(status: AlphaStatusV10): boolean {
  return STONE_COUNT_FIELDS.every(field => status[field] === 0n);
}

export function verifyAlphaStatusV10(status: AlphaStatusV10): AlphaStatusV10 {
  const { water, stone } = ALPHA_V10_ACTIVATION_COMPONENTS;
  if (
    status.schemaProtocolVersion !== ALPHA_V10_ACTIVATION_SCHEMA_PROTOCOL_VERSION
    || status.backendProtocolVersion !== WARPKEEP_BACKEND_PROTOCOL_VERSION
    || status.waterPolicyVersion !== water.policyVersion
    || status.waterLayoutVersion !== water.layoutVersion
    || status.canonicalWaterLayoutDigest !== water.layoutDigest
    || status.stoneSitePolicyVersion !== stone.sitePolicyVersion
    || status.stoneExpeditionPolicyVersion !== stone.expeditionPolicyVersion
    || status.canonicalStoneSiteCatalogDigest !== stone.siteCatalogDigest
  ) fail('Alpha v10 policy identity did not match this operator build.');
  for (const field of COUNT_FIELDS) {
    if (typeof status[field] !== 'bigint' || status[field] < 0n) {
      fail('Alpha v10 aggregate contained an invalid count.');
    }
  }
  if (!exactWaterEmpty(status) && !exactWaterReady(status)) {
    fail('Water aggregate is neither empty nor canonical.');
  }
  if (!exactStoneEmpty(status) && !exactStoneReady(status)) {
    fail('Stone aggregate is neither empty nor canonical.');
  }
  if (!exactStoneReady(status) && STONE_COUNT_FIELDS.slice(2).some(field => status[field] !== 0n)) {
    fail('Stone activity exists without its canonical catalog.');
  }
  if (status.waterActivated && !exactWaterReady(status)) {
    fail('Water is activated without its canonical projection.');
  }
  return Object.freeze({ ...status });
}

/** Copy the aggregate-only output allowlist before machine output. */
export function projectAlphaStatusV10(status: AlphaStatusV10): AlphaStatusV10 {
  return verifyAlphaStatusV10({
    schemaProtocolVersion: status.schemaProtocolVersion,
    backendProtocolVersion: status.backendProtocolVersion,
    waterPolicyVersion: status.waterPolicyVersion,
    waterLayoutVersion: status.waterLayoutVersion,
    canonicalWaterLayoutDigest: status.canonicalWaterLayoutDigest,
    waterActivated: status.waterActivated,
    waterLayouts: status.waterLayouts,
    canonicalWaterLayouts: status.canonicalWaterLayouts,
    waterBodies: status.waterBodies,
    canonicalWaterBodies: status.canonicalWaterBodies,
    waterCells: status.waterCells,
    canonicalWaterCells: status.canonicalWaterCells,
    realmEnvironments: status.realmEnvironments,
    canonicalRealmEnvironments: status.canonicalRealmEnvironments,
    stoneSitePolicyVersion: status.stoneSitePolicyVersion,
    stoneExpeditionPolicyVersion: status.stoneExpeditionPolicyVersion,
    canonicalStoneSiteCatalogDigest: status.canonicalStoneSiteCatalogDigest,
    stoneSites: status.stoneSites,
    canonicalStoneSites: status.canonicalStoneSites,
    stoneOccupations: status.stoneOccupations,
    stoneExpeditions: status.stoneExpeditions,
    stoneIdempotencyReceipts: status.stoneIdempotencyReceipts,
    stoneSchedules: status.stoneSchedules,
  });
}

export function alphaV10ComponentIsReady(
  status: AlphaStatusV10,
  component: AlphaV10ActivationComponent,
): boolean {
  return component === 'water' ? exactWaterReady(status) : exactStoneReady(status);
}

export function verifyAlphaV10SeedPostcondition(
  status: AlphaStatusV10,
  before: AlphaStatusV10,
  component: AlphaV10ActivationComponent,
): AlphaStatusV10 {
  const verifiedBefore = verifyAlphaStatusV10(before);
  const verified = verifyAlphaStatusV10(status);
  if (!alphaV10ComponentIsReady(verified, component)) {
    fail('Alpha v10 component seed did not reach its canonical aggregate count.');
  }
  const mutable = new Set<keyof AlphaStatusV10>(
    component === 'water' ? WATER_COUNT_FIELDS : ['stoneSites', 'canonicalStoneSites'],
  );
  for (const field of COUNT_FIELDS) {
    if (!mutable.has(field) && verified[field] !== verifiedBefore[field]) {
      fail('Alpha v10 component seed changed an unrelated aggregate.');
    }
  }
  if (verified.waterActivated !== verifiedBefore.waterActivated) {
    fail('Alpha v10 component seed changed Water activation state.');
  }
  return verified;
}

export function verifyWaterActivationPostcondition(
  status: AlphaStatusV10,
  before: AlphaStatusV10,
): AlphaStatusV10 {
  const verifiedBefore = verifyAlphaStatusV10(before);
  const verified = verifyAlphaStatusV10(status);
  if (!exactWaterReady(verifiedBefore) || !exactWaterReady(verified) || !verified.waterActivated) {
    fail('Water activation did not reach an exact active projection.');
  }
  for (const field of COUNT_FIELDS) {
    if (verified[field] !== verifiedBefore[field]) {
      fail('Water activation changed persistent aggregate counts.');
    }
  }
  return verified;
}

export function alphaV10ComponentSeedReceipt(
  component: AlphaV10ActivationComponent,
  before: AlphaStatusV10,
  after: AlphaStatusV10,
) {
  const policy = ALPHA_V10_ACTIVATION_COMPONENTS[component];
  return Object.freeze({
    operation: 'seed-alpha-component',
    component,
    outcome: alphaV10ComponentIsReady(before, component) ? 'already-ready' : 'seeded',
    schemaProtocolVersion: ALPHA_V10_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
    policy,
    beforeCount: component === 'water' ? before.waterCells : before.stoneSites,
    afterCount: component === 'water' ? after.waterCells : after.stoneSites,
  });
}

export function waterActivationReceipt(before: AlphaStatusV10, after: AlphaStatusV10) {
  return Object.freeze({
    operation: 'activate-alpha-water',
    outcome: before.waterActivated ? 'already-active' : 'activated',
    schemaProtocolVersion: ALPHA_V10_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
    layoutVersion: after.waterLayoutVersion,
    canonicalLayoutDigest: after.canonicalWaterLayoutDigest,
    activated: after.waterActivated,
  });
}
