import {
  ALPHA_ACTIVATION_COMPONENTS,
  ALPHA_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
  type AlphaActivationComponent,
} from '../spacetimedb/src/alphaActivationPolicy';
import { WARPKEEP_BACKEND_PROTOCOL_VERSION } from '../spacetimedb/src/config';

export type AlphaStatusV8 = Readonly<{
  schemaProtocolVersion: number;
  backendProtocolVersion: number;
  goldSitePolicyVersion: string;
  goldExpeditionPolicyVersion: string;
  canonicalGoldSiteCatalogDigest: string;
  goldSites: bigint;
  canonicalGoldSites: bigint;
  goldOccupations: bigint;
  goldExpeditions: bigint;
  goldIdempotencyReceipts: bigint;
  goldSchedules: bigint;
  forestLayoutVersion: number;
  forestPolicyVersion: string;
  canonicalForestLayoutDigest: string;
  canonicalForestAssetCatalogDigest: string;
  forestLayouts: bigint;
  canonicalForestLayouts: bigint;
  forestInstances: bigint;
  canonicalForestInstances: bigint;
  foodSitePolicyVersion: string;
  foodExpeditionPolicyVersion: string;
  canonicalFoodSiteCatalogDigest: string;
  foodSites: bigint;
  canonicalFoodSites: bigint;
  foodOccupations: bigint;
  foodExpeditions: bigint;
  foodIdempotencyReceipts: bigint;
  foodSchedules: bigint;
  woodSitePolicyVersion: string;
  woodExpeditionPolicyVersion: string;
  canonicalWoodSiteCatalogDigest: string;
  woodSites: bigint;
  canonicalWoodSites: bigint;
  woodOccupations: bigint;
  woodExpeditions: bigint;
  woodIdempotencyReceipts: bigint;
  woodSchedules: bigint;
}>;

export class AlphaActivationControlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlphaActivationControlError';
  }
}

const COUNT_FIELDS = Object.freeze([
  'goldSites',
  'canonicalGoldSites',
  'goldOccupations',
  'goldExpeditions',
  'goldIdempotencyReceipts',
  'goldSchedules',
  'forestLayouts',
  'canonicalForestLayouts',
  'forestInstances',
  'canonicalForestInstances',
  'foodSites',
  'canonicalFoodSites',
  'foodOccupations',
  'foodExpeditions',
  'foodIdempotencyReceipts',
  'foodSchedules',
  'woodSites',
  'canonicalWoodSites',
  'woodOccupations',
  'woodExpeditions',
  'woodIdempotencyReceipts',
  'woodSchedules',
] as const satisfies readonly (keyof AlphaStatusV8)[]);

const COMPONENT_COUNT_FIELDS = Object.freeze({
  gold: Object.freeze([
    'goldSites',
    'canonicalGoldSites',
    'goldOccupations',
    'goldExpeditions',
    'goldIdempotencyReceipts',
    'goldSchedules',
  ] as const),
  forest: Object.freeze([
    'forestLayouts',
    'canonicalForestLayouts',
    'forestInstances',
    'canonicalForestInstances',
  ] as const),
  food: Object.freeze([
    'foodSites',
    'canonicalFoodSites',
    'foodOccupations',
    'foodExpeditions',
    'foodIdempotencyReceipts',
    'foodSchedules',
  ] as const),
  wood: Object.freeze([
    'woodSites',
    'canonicalWoodSites',
    'woodOccupations',
    'woodExpeditions',
    'woodIdempotencyReceipts',
    'woodSchedules',
  ] as const),
});

function fail(message: string): never {
  throw new AlphaActivationControlError(message);
}

export function parseAlphaActivationComponent(value: string | undefined): AlphaActivationComponent {
  if (value === 'gold' || value === 'forest' || value === 'food' || value === 'wood') {
    return value;
  }
  return fail('Alpha component must be one of: gold, forest, food, wood.');
}

function exactOrEmpty(actual: bigint, expected: number): boolean {
  return actual === 0n || actual === BigInt(expected);
}

function canonicalSiteCountField(component: 'gold' | 'food' | 'wood') {
  return (`canonical${component[0]!.toUpperCase()}${component.slice(1)}Sites`) as
    'canonicalGoldSites' | 'canonicalFoodSites' | 'canonicalWoodSites';
}

function requireCatalogShape(status: AlphaStatusV8): void {
  const { gold, forest, food, wood } = ALPHA_ACTIVATION_COMPONENTS;
  if (!exactOrEmpty(status.goldSites, gold.siteCount)) {
    fail('Gold catalog count is neither empty nor canonical.');
  }
  if (!exactOrEmpty(status.foodSites, food.siteCount)) {
    fail('Food catalog count is neither empty nor canonical.');
  }
  if (!exactOrEmpty(status.woodSites, wood.siteCount)) {
    fail('Wood catalog count is neither empty nor canonical.');
  }
  if (
    status.canonicalGoldSites !== status.goldSites
    || status.canonicalFoodSites !== status.foodSites
    || status.canonicalWoodSites !== status.woodSites
  ) {
    fail('A resource catalog contains noncanonical rows.');
  }
  const forestEmpty = status.forestLayouts === 0n && status.forestInstances === 0n;
  const forestReady = status.forestLayouts === BigInt(forest.layoutCount)
    && status.forestInstances === BigInt(forest.instanceCount);
  if (!forestEmpty && !forestReady) {
    fail('Forest catalog counts are neither empty nor canonical.');
  }
  if (
    status.canonicalForestLayouts !== status.forestLayouts
    || status.canonicalForestInstances !== status.forestInstances
  ) {
    fail('The forest catalog contains noncanonical rows.');
  }
  for (const component of ['gold', 'food', 'wood'] as const) {
    const [siteField, ...activityFields] = COMPONENT_COUNT_FIELDS[component];
    if (status[siteField] !== 0n) continue;
    if (activityFields.some(field => status[field] !== 0n)) {
      fail(`${component[0]!.toUpperCase()}${component.slice(1)} activity exists without its catalog.`);
    }
  }
}

/** Verify only fixed public policy identifiers and aggregate cardinalities. */
export function verifyAlphaStatusV8(status: AlphaStatusV8): AlphaStatusV8 {
  const { gold, forest, food, wood } = ALPHA_ACTIVATION_COMPONENTS;
  if (
    status.schemaProtocolVersion !== ALPHA_ACTIVATION_SCHEMA_PROTOCOL_VERSION
    || status.backendProtocolVersion !== WARPKEEP_BACKEND_PROTOCOL_VERSION
    || status.goldSitePolicyVersion !== gold.sitePolicyVersion
    || status.goldExpeditionPolicyVersion !== gold.expeditionPolicyVersion
    || status.canonicalGoldSiteCatalogDigest !== gold.siteCatalogDigest
    || status.forestLayoutVersion !== forest.layoutVersion
    || status.forestPolicyVersion !== forest.policyVersion
    || status.canonicalForestLayoutDigest !== forest.layoutDigest
    || status.canonicalForestAssetCatalogDigest !== forest.assetCatalogDigest
    || status.foodSitePolicyVersion !== food.sitePolicyVersion
    || status.foodExpeditionPolicyVersion !== food.expeditionPolicyVersion
    || status.canonicalFoodSiteCatalogDigest !== food.siteCatalogDigest
    || status.woodSitePolicyVersion !== wood.sitePolicyVersion
    || status.woodExpeditionPolicyVersion !== wood.expeditionPolicyVersion
    || status.canonicalWoodSiteCatalogDigest !== wood.siteCatalogDigest
  ) {
    fail('Alpha v8 policy identity did not match this operator build.');
  }
  for (const field of COUNT_FIELDS) {
    if (typeof status[field] !== 'bigint' || status[field] < 0n) {
      fail('Alpha v8 aggregate contained an invalid count.');
    }
  }
  requireCatalogShape(status);
  return Object.freeze({ ...status });
}

/** Copy the closed output allowlist before validation or machine output. */
export function projectAlphaStatusV8(status: AlphaStatusV8): AlphaStatusV8 {
  return verifyAlphaStatusV8({
    schemaProtocolVersion: status.schemaProtocolVersion,
    backendProtocolVersion: status.backendProtocolVersion,
    goldSitePolicyVersion: status.goldSitePolicyVersion,
    goldExpeditionPolicyVersion: status.goldExpeditionPolicyVersion,
    canonicalGoldSiteCatalogDigest: status.canonicalGoldSiteCatalogDigest,
    goldSites: status.goldSites,
    canonicalGoldSites: status.canonicalGoldSites,
    goldOccupations: status.goldOccupations,
    goldExpeditions: status.goldExpeditions,
    goldIdempotencyReceipts: status.goldIdempotencyReceipts,
    goldSchedules: status.goldSchedules,
    forestLayoutVersion: status.forestLayoutVersion,
    forestPolicyVersion: status.forestPolicyVersion,
    canonicalForestLayoutDigest: status.canonicalForestLayoutDigest,
    canonicalForestAssetCatalogDigest: status.canonicalForestAssetCatalogDigest,
    forestLayouts: status.forestLayouts,
    canonicalForestLayouts: status.canonicalForestLayouts,
    forestInstances: status.forestInstances,
    canonicalForestInstances: status.canonicalForestInstances,
    foodSitePolicyVersion: status.foodSitePolicyVersion,
    foodExpeditionPolicyVersion: status.foodExpeditionPolicyVersion,
    canonicalFoodSiteCatalogDigest: status.canonicalFoodSiteCatalogDigest,
    foodSites: status.foodSites,
    canonicalFoodSites: status.canonicalFoodSites,
    foodOccupations: status.foodOccupations,
    foodExpeditions: status.foodExpeditions,
    foodIdempotencyReceipts: status.foodIdempotencyReceipts,
    foodSchedules: status.foodSchedules,
    woodSitePolicyVersion: status.woodSitePolicyVersion,
    woodExpeditionPolicyVersion: status.woodExpeditionPolicyVersion,
    canonicalWoodSiteCatalogDigest: status.canonicalWoodSiteCatalogDigest,
    woodSites: status.woodSites,
    canonicalWoodSites: status.canonicalWoodSites,
    woodOccupations: status.woodOccupations,
    woodExpeditions: status.woodExpeditions,
    woodIdempotencyReceipts: status.woodIdempotencyReceipts,
    woodSchedules: status.woodSchedules,
  });
}

export function alphaComponentIsReady(
  status: AlphaStatusV8,
  component: AlphaActivationComponent,
): boolean {
  if (component === 'forest') {
    const policy = ALPHA_ACTIVATION_COMPONENTS.forest;
    return status.forestLayouts === BigInt(policy.layoutCount)
      && status.canonicalForestLayouts === BigInt(policy.layoutCount)
      && status.forestInstances === BigInt(policy.instanceCount)
      && status.canonicalForestInstances === BigInt(policy.instanceCount);
  }
  const field = `${component}Sites` as 'goldSites' | 'foodSites' | 'woodSites';
  const canonicalField = canonicalSiteCountField(component);
  return status[field] === BigInt(ALPHA_ACTIVATION_COMPONENTS[component].siteCount)
    && status[canonicalField] === BigInt(ALPHA_ACTIVATION_COMPONENTS[component].siteCount);
}

export function verifyAlphaComponentSeedPrecondition(
  status: AlphaStatusV8,
): AlphaStatusV8 {
  return verifyAlphaStatusV8(status);
}

export function verifyAlphaComponentSeedPostcondition(
  status: AlphaStatusV8,
  before: AlphaStatusV8,
  component: AlphaActivationComponent,
): AlphaStatusV8 {
  const verified = verifyAlphaStatusV8(status);
  if (!alphaComponentIsReady(verified, component)) {
    fail('Alpha component seed did not reach its canonical aggregate count.');
  }
  const mutableFields = new Set<keyof AlphaStatusV8>(
    component === 'forest'
      ? [
          'forestLayouts',
          'canonicalForestLayouts',
          'forestInstances',
          'canonicalForestInstances',
        ]
      : [
          `${component}Sites` as keyof AlphaStatusV8,
          `canonical${component[0]!.toUpperCase()}${component.slice(1)}Sites` as keyof AlphaStatusV8,
        ],
  );
  for (const field of COUNT_FIELDS) {
    if (!mutableFields.has(field) && verified[field] !== before[field]) {
      fail(
        'Alpha component seed changed an unrelated aggregate. '
        + 'Do not retry before a fresh read-only inspection.',
      );
    }
  }
  return verified;
}

/** Receipt contains canonical policy and counts only; it carries no row data. */
export function alphaComponentSeedReceipt(
  component: AlphaActivationComponent,
  before: AlphaStatusV8,
  after: AlphaStatusV8,
) {
  const alreadyReady = alphaComponentIsReady(before, component);
  if (component === 'forest') {
    const policy = ALPHA_ACTIVATION_COMPONENTS.forest;
    return Object.freeze({
      operation: 'seed-alpha-component',
      component,
      outcome: alreadyReady ? 'already-ready' : 'seeded',
      schemaProtocolVersion: ALPHA_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
      policyVersion: policy.policyVersion,
      canonicalLayoutDigest: policy.layoutDigest,
      canonicalAssetCatalogDigest: policy.assetCatalogDigest,
      expectedLayoutCount: policy.layoutCount,
      expectedInstanceCount: policy.instanceCount,
      beforeLayoutCount: before.forestLayouts,
      beforeInstanceCount: before.forestInstances,
      afterLayoutCount: after.forestLayouts,
      afterInstanceCount: after.forestInstances,
      canonicalLayoutCount: after.canonicalForestLayouts,
      canonicalInstanceCount: after.canonicalForestInstances,
    });
  }
  const policy = ALPHA_ACTIVATION_COMPONENTS[component];
  const field = `${component}Sites` as 'goldSites' | 'foodSites' | 'woodSites';
  return Object.freeze({
    operation: 'seed-alpha-component',
    component,
    outcome: alreadyReady ? 'already-ready' : 'seeded',
    schemaProtocolVersion: ALPHA_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
    sitePolicyVersion: policy.sitePolicyVersion,
    expeditionPolicyVersion: policy.expeditionPolicyVersion,
    canonicalSiteCatalogDigest: policy.siteCatalogDigest,
    expectedSiteCount: policy.siteCount,
    beforeSiteCount: before[field],
    afterSiteCount: after[field],
    canonicalSiteCount: after[canonicalSiteCountField(component)],
  });
}
