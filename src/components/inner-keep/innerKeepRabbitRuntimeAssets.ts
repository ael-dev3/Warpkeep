import { REALM_RABBIT_RUNTIME_ASSET } from '../realm/realmRabbitRuntimeAsset';

/**
 * Immutable, content-addressed Lowlands Rabbit catalog. These files are
 * optional presentation media only: model selection cannot establish animal
 * population, collision, resources, rewards, ownership, or world authority.
 */
export const INNER_KEEP_RABBIT_RUNTIME_SELECTION_DIGEST =
  '39ff0df2a78e475f1a8caaeac3fe48505c812905e894fe9eb282f01deb1a7eb0';

export const INNER_KEEP_RABBIT_RUNTIME_LODS = Object.freeze([
  'high',
  'balanced',
  'compact',
] as const);

export const INNER_KEEP_RABBIT_ANIMATION_CLIPS = Object.freeze([
  'Alert',
  'Idle',
  'Nibble',
  'Walk',
] as const);

export type InnerKeepRabbitRuntimeLod =
  typeof INNER_KEEP_RABBIT_RUNTIME_LODS[number];

export type InnerKeepRabbitRuntimeModel = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
  triangles: number;
  uploadedVertices: number;
  drawCalls: number;
  rigged: boolean;
  animations: readonly string[];
}>;

export const INNER_KEEP_RABBIT_RUNTIME_ASSETS: Readonly<Record<
  InnerKeepRabbitRuntimeLod,
  InnerKeepRabbitRuntimeModel
>> = Object.freeze({
  high: Object.freeze({
    path: 'models/hegemony/inner-keep/wildlife/rabbit/'
      + 'inner-keep-lowlands-rabbit-high-735f7d72457acfb2.glb',
    bytes: 129_388,
    sha256: '735f7d72457acfb20581cfcacbd8908eab3ef36d5640b63ecb134bbaa7a10b1d',
    triangles: 726,
    uploadedVertices: 1_640,
    drawCalls: 1,
    rigged: true,
    animations: INNER_KEEP_RABBIT_ANIMATION_CLIPS,
  }),
  balanced: Object.freeze({
    path: 'models/hegemony/inner-keep/wildlife/rabbit/'
      + 'inner-keep-lowlands-rabbit-balanced-daeb493a827ecbd6.glb',
    bytes: 86_340,
    sha256: 'daeb493a827ecbd605c6ad25d83b84050e6a0ad29e96619c9d86c57c37be1f6a',
    triangles: 350,
    uploadedVertices: 856,
    drawCalls: 1,
    rigged: true,
    animations: INNER_KEEP_RABBIT_ANIMATION_CLIPS,
  }),
  compact: Object.freeze({
    path: REALM_RABBIT_RUNTIME_ASSET.path,
    bytes: REALM_RABBIT_RUNTIME_ASSET.bytes,
    sha256: REALM_RABBIT_RUNTIME_ASSET.sha256,
    triangles: REALM_RABBIT_RUNTIME_ASSET.triangles,
    uploadedVertices: REALM_RABBIT_RUNTIME_ASSET.uploadedVertices,
    drawCalls: 1,
    rigged: false,
    animations: Object.freeze([]),
  }),
});

export function innerKeepRabbitModel(lod: InnerKeepRabbitRuntimeLod) {
  return INNER_KEEP_RABBIT_RUNTIME_ASSETS[lod];
}

/**
 * Keep ordinary High and Balanced herds on the economical Balanced rig.
 * Callers may still request `high` explicitly for a close-detail hero animal.
 */
export function innerKeepRabbitLodForQuality(
  quality: 'high' | 'balanced' | 'reduced',
  reducedMotion: boolean,
): InnerKeepRabbitRuntimeLod {
  return quality === 'reduced' || reducedMotion ? 'compact' : 'balanced';
}
