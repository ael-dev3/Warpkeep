/** Exact frozen protocol-v1 browser compatibility check used only for migration regression. */
export const WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION_V1 = 1;
export const WARPKEEP_EXPECTED_WORLD_SEED_NAME_V1 = 'HEGEMONY_GENESIS_001';

export type WarpkeepBackendInfoV1 = Readonly<{
  protocolVersion: number;
  worldSeed: number;
  worldSeedName: string;
}>;

function isUint32V1(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 0xffff_ffff;
}

export function readCompatibleWarpkeepBackendInfoV1(value: unknown): WarpkeepBackendInfoV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Warpkeep backend compatibility metadata is invalid.');
  }
  const info = value as Partial<WarpkeepBackendInfoV1>;
  if (
    !isUint32V1(info.protocolVersion)
    || !isUint32V1(info.worldSeed)
    || typeof info.worldSeedName !== 'string'
    || info.protocolVersion !== WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION_V1
    || info.worldSeedName !== WARPKEEP_EXPECTED_WORLD_SEED_NAME_V1
  ) {
    throw new Error('Warpkeep backend protocol is incompatible.');
  }
  return Object.freeze({
    protocolVersion: info.protocolVersion,
    worldSeed: info.worldSeed,
    worldSeedName: info.worldSeedName
  });
}
