import type { RealmGrassRenderPlan } from './realmGrassActiveWindow';
import {
  REALM_GRASS_RENDER_PLANS,
  type RealmQuality
} from './realmQuality';

export type RealmVegetationProfile = RealmQuality;

export type RealmVegetationCapabilityMode =
  | 'preferred'
  | 'downshifted'
  | 'terrain-only';

export type RealmVegetationCapabilityFailureReason =
  | 'invalid-max-attributes'
  | 'insufficient-attribute-slots'
  | 'profile-unavailable'
  | 'profile-shape-invalid'
  | 'count-shape-invalid'
  | 'unsafe-count-arithmetic'
  | 'per-buffer-upload-ceiling-exceeded'
  | 'repack-upload-ceiling-exceeded';

export type RealmVegetationRepackBufferName =
  | 'grass-instance-matrix'
  | 'grass-instance-color'
  | 'grass-phase'
  | 'grass-stiffness'
  | 'grass-wind-scale'
  | 'grass-cell'
  | 'grass-edge-fade'
  | 'wildflower-instance-matrix'
  | 'wildflower-instance-color'
  | 'wildflower-phase'
  | 'wildflower-wind-scale'
  | 'wildflower-coverage';

export type RealmVegetationRepackBuffer = Readonly<{
  name: RealmVegetationRepackBufferName;
  byteLength: number;
}>;

export type RealmVegetationProfileValidation = Readonly<{
  profile: RealmVegetationProfile;
  compatible: boolean;
  reason: RealmVegetationCapabilityFailureReason | null;
  requiredAttributeSlots: number;
  repackUploadBytes: number;
  repackUploadCeiling: number;
  buffers: readonly RealmVegetationRepackBuffer[];
}>;

export type RealmVegetationCapability = Readonly<{
  mode: RealmVegetationCapabilityMode;
  reason: RealmVegetationCapabilityFailureReason | null;
  preferredProfile: RealmVegetationProfile;
  selectedProfile: RealmVegetationProfile | null;
  maxAttributes: number;
  requiredAttributeSlots: number;
  repackUploadBytes: number;
  repackUploadCeiling: number;
  grassPlan: RealmGrassRenderPlan;
  attempts: readonly RealmVegetationProfileValidation[];
}>;

export type ResolveRealmVegetationCapabilityOptions = Readonly<{
  preferredProfile: RealmVegetationProfile;
  maxAttributes: number;
  /**
   * Testable/profile-owned candidates. Missing entries are unavailable when
   * this map is supplied; omit the map to use every production plan.
   */
  plans?: Readonly<Partial<Record<RealmVegetationProfile, RealmGrassRenderPlan>>>;
}>;

export type ValidateRealmVegetationProfileOptions = Readonly<{
  profile: RealmVegetationProfile;
  maxAttributes: number;
  plan: RealmGrassRenderPlan | null | undefined;
}>;

/**
 * Exact worst-case linked attribute locations for the current Three r185
 * vegetation programs. Matrix columns consume four locations. Instance color
 * is included even though Three creates it lazily on the first populated
 * repack; validating an empty overview program would otherwise undercount.
 * Grass and flowers are separate draws, so their totals are not added.
 */
export const REALM_VEGETATION_COMPILED_ATTRIBUTE_SLOTS = Object.freeze({
  grass: Object.freeze({
    baseGeometry: 3,
    instanceMatrix: 4,
    instanceColor: 1,
    customInstance: 5,
    total: 13
  }),
  wildflower: Object.freeze({
    baseGeometry: 3,
    instanceMatrix: 4,
    instanceColor: 1,
    customInstance: 3,
    total: 11
  })
});

export const REALM_VEGETATION_REPACK_UPLOAD_CEILINGS = Object.freeze({
  high: 1_024 * 1_024,
  balanced: 512 * 1_024,
  reduced: 192 * 1_024
} satisfies Readonly<Record<RealmVegetationProfile, number>>);

export const REALM_VEGETATION_WILDFLOWER_INSTANCE_BUDGETS = Object.freeze({
  high: 512,
  balanced: 256,
  reduced: 0
} satisfies Readonly<Record<RealmVegetationProfile, number>>);

/** Dynamic Float32 values rewritten for each visible grass/flower instance. */
export const REALM_VEGETATION_REPACK_FLOATS_PER_INSTANCE = Object.freeze({
  grass: 25,
  wildflower: 22
});

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;
const GRASS_ATTRIBUTE_SLOTS = REALM_VEGETATION_COMPILED_ATTRIBUTE_SLOTS.grass.total;

const REPACK_BUFFER_LAYOUT = Object.freeze([
  Object.freeze({ name: 'grass-instance-matrix', kind: 'grass', components: 16 }),
  Object.freeze({ name: 'grass-instance-color', kind: 'grass', components: 3 }),
  Object.freeze({ name: 'grass-phase', kind: 'grass', components: 1 }),
  Object.freeze({ name: 'grass-stiffness', kind: 'grass', components: 1 }),
  Object.freeze({ name: 'grass-wind-scale', kind: 'grass', components: 1 }),
  Object.freeze({ name: 'grass-cell', kind: 'grass', components: 2 }),
  Object.freeze({ name: 'grass-edge-fade', kind: 'grass', components: 1 }),
  Object.freeze({ name: 'wildflower-instance-matrix', kind: 'wildflower', components: 16 }),
  Object.freeze({ name: 'wildflower-instance-color', kind: 'wildflower', components: 3 }),
  Object.freeze({ name: 'wildflower-phase', kind: 'wildflower', components: 1 }),
  Object.freeze({ name: 'wildflower-wind-scale', kind: 'wildflower', components: 1 }),
  Object.freeze({ name: 'wildflower-coverage', kind: 'wildflower', components: 1 })
] satisfies readonly Readonly<{
  name: RealmVegetationRepackBufferName;
  kind: 'grass' | 'wildflower';
  components: number;
}>[]);

const COUNT_FIELDS = Object.freeze([
  'maximumNearInstances',
  'maximumMidInstances',
  'maximumNearTriangles',
  'maximumMidTriangles',
  'maximumNearDrawCalls',
  'maximumMidDrawCalls',
  'maximumActiveInstances',
  'maximumActiveTriangles',
  'maximumActiveDrawCalls',
  'cacheLimit'
] satisfies readonly (keyof RealmGrassRenderPlan)[]);

const PLAN_SHAPE_FIELDS = Object.freeze([
  'enabled',
  'geometryProfile',
  'nearRadius',
  'lodTransitionCells',
  'midDensityMultiplier',
  ...COUNT_FIELDS,
  'activeRadius',
  'hysteresisRadius',
  'edgeFadeCells',
  'animationFrameCap',
  'densityMultiplier',
  'windStrengthMultiplier',
  'overviewSuppressed'
] satisfies readonly (keyof RealmGrassRenderPlan)[]);

const PROFILE_ORDER = Object.freeze([
  'high',
  'balanced',
  'reduced'
] satisfies readonly RealmVegetationProfile[]);

/**
 * Inert plan used by every downstream scene consumer after capability
 * preflight fails. The grass factory is still skipped; the zero shape makes
 * telemetry and animation policy safe if a future caller reads the plan.
 */
export const REALM_TERRAIN_ONLY_GRASS_PLAN: RealmGrassRenderPlan = Object.freeze({
  enabled: false,
  geometryProfile: 'reduced',
  nearRadius: 0,
  lodTransitionCells: 0,
  midDensityMultiplier: 0,
  maximumNearInstances: 0,
  maximumMidInstances: 0,
  maximumNearTriangles: 0,
  maximumMidTriangles: 0,
  maximumNearDrawCalls: 0,
  maximumMidDrawCalls: 0,
  maximumActiveInstances: 0,
  maximumActiveTriangles: 0,
  maximumActiveDrawCalls: 0,
  activeRadius: 0,
  hysteresisRadius: 0,
  edgeFadeCells: 0,
  animationFrameCap: 0,
  cacheLimit: 0,
  densityMultiplier: 0,
  windStrengthMultiplier: 0,
  overviewSuppressed: true
});

function normalizedMaxAttributes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value));
}

function isSafeCount(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0;
}

function safeMultiply(left: number, right: number): number | null {
  if (!isSafeCount(left) || !isSafeCount(right)) return null;
  if (left === 0 || right === 0) return 0;
  if (left > Math.floor(Number.MAX_SAFE_INTEGER / right)) return null;
  return left * right;
}

function safeAdd(left: number, right: number): number | null {
  if (!isSafeCount(left) || !isSafeCount(right)) return null;
  if (left > Number.MAX_SAFE_INTEGER - right) return null;
  return left + right;
}

function failedValidation(
  profile: RealmVegetationProfile,
  reason: RealmVegetationCapabilityFailureReason,
  ceiling = REALM_VEGETATION_REPACK_UPLOAD_CEILINGS[profile],
  buffers: readonly RealmVegetationRepackBuffer[] = Object.freeze([]),
  repackUploadBytes = 0
): RealmVegetationProfileValidation {
  return Object.freeze({
    profile,
    compatible: false,
    reason,
    requiredAttributeSlots: GRASS_ATTRIBUTE_SLOTS,
    repackUploadBytes,
    repackUploadCeiling: ceiling,
    buffers
  });
}

function planMatchesProfileShape(
  profile: RealmVegetationProfile,
  plan: RealmGrassRenderPlan
) {
  const expected = REALM_GRASS_RENDER_PLANS[profile];
  return PLAN_SHAPE_FIELDS.every((field) => plan[field] === expected[field]);
}

/**
 * Validate one complete grass-plus-flower profile without allocating typed
 * arrays, Three geometries, meshes, or materials.
 */
export function validateRealmVegetationProfile(
  options: ValidateRealmVegetationProfileOptions
): RealmVegetationProfileValidation {
  const { profile, plan } = options;
  const ceiling = REALM_VEGETATION_REPACK_UPLOAD_CEILINGS[profile];
  const maxAttributes = normalizedMaxAttributes(options.maxAttributes);
  if (maxAttributes === 0) {
    return failedValidation(profile, 'invalid-max-attributes', ceiling);
  }
  if (maxAttributes < GRASS_ATTRIBUTE_SLOTS) {
    return failedValidation(profile, 'insufficient-attribute-slots', ceiling);
  }
  if (!plan) return failedValidation(profile, 'profile-unavailable', ceiling);
  if (plan.enabled !== true || plan.geometryProfile !== profile) {
    return failedValidation(profile, 'profile-shape-invalid', ceiling);
  }
  if (!COUNT_FIELDS.every((field) => isSafeCount(plan[field]))) {
    return failedValidation(profile, 'count-shape-invalid', ceiling);
  }

  const combinedInstanceCount = safeAdd(
    plan.maximumNearInstances,
    plan.maximumMidInstances
  );
  const combinedTriangleCount = safeAdd(
    plan.maximumNearTriangles,
    plan.maximumMidTriangles
  );
  const combinedDrawCalls = safeAdd(
    plan.maximumNearDrawCalls,
    plan.maximumMidDrawCalls
  );
  if (
    combinedInstanceCount === null
    || combinedTriangleCount === null
    || combinedDrawCalls === null
  ) {
    return failedValidation(profile, 'unsafe-count-arithmetic', ceiling);
  }
  if (
    combinedInstanceCount !== plan.maximumActiveInstances
    || combinedTriangleCount > plan.maximumActiveTriangles
    || combinedDrawCalls !== plan.maximumActiveDrawCalls
  ) {
    return failedValidation(profile, 'count-shape-invalid', ceiling);
  }

  const instanceCounts = Object.freeze({
    grass: plan.maximumActiveInstances,
    wildflower: REALM_VEGETATION_WILDFLOWER_INSTANCE_BUDGETS[profile]
  });
  const buffers: RealmVegetationRepackBuffer[] = [];
  let repackUploadBytes = 0;
  for (const layout of REPACK_BUFFER_LAYOUT) {
    const componentCount = safeMultiply(instanceCounts[layout.kind], layout.components);
    const byteLength = componentCount === null
      ? null
      : safeMultiply(componentCount, FLOAT_BYTES);
    if (byteLength === null) {
      return failedValidation(
        profile,
        'unsafe-count-arithmetic',
        ceiling,
        Object.freeze(buffers)
      );
    }
    const buffer = Object.freeze({ name: layout.name, byteLength });
    buffers.push(buffer);
    if (byteLength > ceiling) {
      return failedValidation(
        profile,
        'per-buffer-upload-ceiling-exceeded',
        ceiling,
        Object.freeze(buffers),
        repackUploadBytes
      );
    }
    const nextUploadBytes = safeAdd(repackUploadBytes, byteLength);
    if (nextUploadBytes === null) {
      return failedValidation(
        profile,
        'unsafe-count-arithmetic',
        ceiling,
        Object.freeze(buffers),
        repackUploadBytes
      );
    }
    repackUploadBytes = nextUploadBytes;
  }
  const frozenBuffers = Object.freeze(buffers);
  if (repackUploadBytes > ceiling) {
    return failedValidation(
      profile,
      'repack-upload-ceiling-exceeded',
      ceiling,
      frozenBuffers,
      repackUploadBytes
    );
  }
  if (!planMatchesProfileShape(profile, plan)) {
    return failedValidation(
      profile,
      'profile-shape-invalid',
      ceiling,
      frozenBuffers,
      repackUploadBytes
    );
  }
  return Object.freeze({
    profile,
    compatible: true,
    reason: null,
    requiredAttributeSlots: GRASS_ATTRIBUTE_SLOTS,
    repackUploadBytes,
    repackUploadCeiling: ceiling,
    buffers: frozenBuffers
  });
}

/** Prefer the requested profile, then move only downward through proven plans. */
export function resolveRealmVegetationCapability(
  options: ResolveRealmVegetationCapabilityOptions
): RealmVegetationCapability {
  const preferredIndex = PROFILE_ORDER.indexOf(options.preferredProfile);
  const candidates = PROFILE_ORDER.slice(preferredIndex < 0 ? PROFILE_ORDER.length : preferredIndex);
  const maxAttributes = normalizedMaxAttributes(options.maxAttributes);
  const attempts: RealmVegetationProfileValidation[] = [];
  for (const profile of candidates) {
    const plan = options.plans === undefined
      ? REALM_GRASS_RENDER_PLANS[profile]
      : options.plans[profile];
    const validation = validateRealmVegetationProfile({
      profile,
      maxAttributes: options.maxAttributes,
      plan
    });
    attempts.push(validation);
    if (!validation.compatible || !plan) continue;
    return Object.freeze({
      mode: profile === options.preferredProfile ? 'preferred' : 'downshifted',
      reason: attempts[0]?.reason ?? null,
      preferredProfile: options.preferredProfile,
      selectedProfile: profile,
      maxAttributes,
      requiredAttributeSlots: validation.requiredAttributeSlots,
      repackUploadBytes: validation.repackUploadBytes,
      repackUploadCeiling: validation.repackUploadCeiling,
      grassPlan: plan,
      attempts: Object.freeze(attempts)
    });
  }
  return Object.freeze({
    mode: 'terrain-only',
    reason: attempts[0]?.reason ?? 'profile-unavailable',
    preferredProfile: options.preferredProfile,
    selectedProfile: null,
    maxAttributes,
    requiredAttributeSlots: GRASS_ATTRIBUTE_SLOTS,
    repackUploadBytes: 0,
    repackUploadCeiling: 0,
    grassPlan: REALM_TERRAIN_ONLY_GRASS_PLAN,
    attempts: Object.freeze(attempts)
  });
}
