/** Exact frozen protocol-v2 browser compatibility check used only for migration regression. */
export const WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION_V2 = 2;
export const WARPKEEP_EXPECTED_WORLD_SEED_V2 = 3_445_214_658;
export const WARPKEEP_EXPECTED_WORLD_SEED_NAME_V2 = 'HEGEMONY_GENESIS_001';

export type WarpkeepBackendInfoV2 = Readonly<{
  protocolVersion: number;
  worldSeed: number;
  worldSeedName: string;
}>;

function isUint32V2(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && (value as number) <= 0xffff_ffff;
}

export function readCompatibleWarpkeepBackendInfoV2(value: unknown): WarpkeepBackendInfoV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Warpkeep backend compatibility metadata is invalid.');
  }
  const info = value as Partial<WarpkeepBackendInfoV2>;
  if (
    !isUint32V2(info.protocolVersion)
    || !isUint32V2(info.worldSeed)
    || typeof info.worldSeedName !== 'string'
    || info.protocolVersion !== WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION_V2
    || info.worldSeed !== WARPKEEP_EXPECTED_WORLD_SEED_V2
    || info.worldSeedName !== WARPKEEP_EXPECTED_WORLD_SEED_NAME_V2
  ) {
    throw new Error('Warpkeep backend protocol is incompatible.');
  }
  return Object.freeze({
    protocolVersion: info.protocolVersion,
    worldSeed: info.worldSeed,
    worldSeedName: info.worldSeedName,
  });
}
