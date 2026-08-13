import type { GreaterRealmLod } from './greaterRealmPublicContract';

export type GreaterRealmDeviceClass = 'desktop' | 'mobile';
export type GreaterRealmGraphicsProfile = 'high' | 'balanced' | 'reduced';

export type GreaterRealmGraphicsBudget = Readonly<{
  maximumResidentChunks: number;
  maximumVisibleChunks: number;
  maximumDrawCalls: number;
  maximumSceneInstances: number;
  maximumUploadsPerFrame: number;
  maximumUploadBytesPerFrame: number;
  grassPatchCount: number;
  grassBladeCount: number;
  grassTriangleCount: number;
  grassDrawCalls: number;
  flowerCount: number;
  flowerDrawCalls: number;
  flowerGeometryBytes: number;
  canopyCount: number;
  npcCount: number;
  wildlifeCount: number;
  boatCount: number;
  animationFrameCap: number;
}>;

export type GreaterRealmNetworkBudget = Readonly<{
  fetchConcurrency: number;
  decodeConcurrency: number;
}>;

/** Exact #193 review ceilings; none scale with continent cardinality. */
export const GREATER_REALM_GRAPHICS_BUDGETS = Object.freeze({
  high: Object.freeze({
    maximumResidentChunks: 128,
    maximumVisibleChunks: 32,
    maximumDrawCalls: 180,
    maximumSceneInstances: 80_000,
    maximumUploadsPerFrame: 2,
    maximumUploadBytesPerFrame: 1_048_576,
    grassPatchCount: 7_000,
    grassBladeCount: 63_000,
    grassTriangleCount: 189_000,
    grassDrawCalls: 3,
    flowerCount: 512,
    flowerDrawCalls: 2,
    flowerGeometryBytes: 1_048_576,
    canopyCount: 7_000,
    npcCount: 64,
    wildlifeCount: 96,
    boatCount: 24,
    animationFrameCap: 24
  }),
  balanced: Object.freeze({
    maximumResidentChunks: 72,
    maximumVisibleChunks: 20,
    maximumDrawCalls: 120,
    maximumSceneInstances: 40_000,
    maximumUploadsPerFrame: 2,
    maximumUploadBytesPerFrame: 524_288,
    grassPatchCount: 4_000,
    grassBladeCount: 28_000,
    grassTriangleCount: 84_000,
    grassDrawCalls: 2,
    flowerCount: 256,
    flowerDrawCalls: 1,
    flowerGeometryBytes: 524_288,
    canopyCount: 4_000,
    npcCount: 40,
    wildlifeCount: 56,
    boatCount: 14,
    animationFrameCap: 18
  }),
  reduced: Object.freeze({
    maximumResidentChunks: 36,
    maximumVisibleChunks: 10,
    maximumDrawCalls: 64,
    maximumSceneInstances: 10_000,
    maximumUploadsPerFrame: 1,
    maximumUploadBytesPerFrame: 196_608,
    grassPatchCount: 1_200,
    grassBladeCount: 6_000,
    grassTriangleCount: 18_000,
    grassDrawCalls: 1,
    flowerCount: 0,
    flowerDrawCalls: 0,
    flowerGeometryBytes: 0,
    canopyCount: 1_200,
    npcCount: 16,
    wildlifeCount: 20,
    boatCount: 6,
    animationFrameCap: 12
  })
} satisfies Readonly<Record<GreaterRealmGraphicsProfile, GreaterRealmGraphicsBudget>>);

export const GREATER_REALM_NETWORK_BUDGETS = Object.freeze({
  desktop: Object.freeze({ fetchConcurrency: 4, decodeConcurrency: 2 }),
  mobile: Object.freeze({ fetchConcurrency: 2, decodeConcurrency: 1 })
} satisfies Readonly<Record<GreaterRealmDeviceClass, GreaterRealmNetworkBudget>>);

export function resolveGreaterRealmDeviceClass(input: Readonly<{
  coarsePointer: boolean;
  viewportWidth: number;
}>): GreaterRealmDeviceClass {
  const width = Number.isFinite(input.viewportWidth) ? input.viewportWidth : 0;
  return input.coarsePointer || width < 760 ? 'mobile' : 'desktop';
}

export function resolveGreaterRealmGraphicsProfile(input: Readonly<{
  deviceClass: GreaterRealmDeviceClass;
  deviceMemoryGiB?: number;
  hardwareConcurrency?: number;
}>): GreaterRealmGraphicsProfile {
  const memory = Number.isFinite(input.deviceMemoryGiB) ? input.deviceMemoryGiB! : 4;
  const cores = Number.isFinite(input.hardwareConcurrency)
    ? input.hardwareConcurrency!
    : 4;
  if (memory < 3 || cores < 4) return 'reduced';
  if (input.deviceClass === 'mobile' || memory < 6 || cores < 8) return 'balanced';
  return 'high';
}

export function greaterRealmLodAllowsCanopy(lod: GreaterRealmLod) {
  return lod <= 2;
}

export function greaterRealmLodAllowsGroundcover(lod: GreaterRealmLod) {
  return lod <= 2;
}

export function greaterRealmLodAllowsActors(lod: GreaterRealmLod) {
  return lod <= 2;
}

export function greaterRealmAnimationEnabled(
  reducedMotion: boolean,
  contextLost: boolean,
  documentVisible: boolean
) {
  return !reducedMotion && !contextLost && documentVisible;
}
