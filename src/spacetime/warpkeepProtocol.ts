/**
 * Browser expectation for the server's internal wire contract. This is not a
 * product release number or a realm seed; it prevents an activated client from
 * treating an incompatible published module as a playable shared alpha.
 */
export const WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION = 2;
export const WARPKEEP_EXPECTED_WORLD_SEED_NAME = 'HEGEMONY_GENESIS_001';

export type WarpkeepBackendInfo = Readonly<{
  protocolVersion: number;
  worldSeed: number;
  worldSeedName: string;
}>;

function isUint32(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 0xffff_ffff;
}

export function readCompatibleWarpkeepBackendInfo(value: unknown): WarpkeepBackendInfo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Warpkeep backend compatibility metadata is invalid.');
  }
  const info = value as Partial<WarpkeepBackendInfo>;
  if (
    !isUint32(info.protocolVersion)
    || !isUint32(info.worldSeed)
    || typeof info.worldSeedName !== 'string'
    || info.protocolVersion !== WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
    || info.worldSeedName !== WARPKEEP_EXPECTED_WORLD_SEED_NAME
  ) {
    throw new Error('Warpkeep backend protocol is incompatible.');
  }
  return Object.freeze({
    protocolVersion: info.protocolVersion,
    worldSeed: info.worldSeed,
    worldSeedName: info.worldSeedName
  });
}
