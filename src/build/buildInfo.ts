import type {
  WarpkeepBuildInfo,
  WarpkeepBuildInfoInput,
  WarpkeepReleaseChannel
} from './buildInfoTypes';

export type { WarpkeepBuildInfo } from './buildInfoTypes';

export const WARPKEEP_REALM_SEED = 'GENESIS 001' as const;
export const WARPKEEP_LOCAL_BUILD_LABEL = 'LOCAL' as const;
export const DEFAULT_WARPKEEP_REPOSITORY_URL = 'https://github.com/ael-dev3/Warpkeep';

const SEMANTIC_VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;

export function readWarpkeepProductVersion(value: unknown) {
  return typeof value === 'string' && SEMANTIC_VERSION_PATTERN.test(value)
    ? value
    : undefined;
}

export function normalizeWarpkeepReleaseChannel(value: unknown): WarpkeepReleaseChannel {
  return typeof value === 'string' && value.trim().toLowerCase() === 'alpha'
    ? 'alpha'
    : 'alpha';
}

export function readWarpkeepBuildSha(value: unknown) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return FULL_SHA_PATTERN.test(candidate) ? candidate.toLowerCase() : undefined;
}

export function readWarpkeepRepositoryUrl(value: unknown) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:'
      || parsed.hostname !== 'github.com'
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.search !== ''
      || parsed.hash !== ''
    ) {
      return undefined;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (
      segments.length !== 2
      || segments.some((segment) => !/^[A-Za-z0-9_.-]+$/.test(segment))
    ) {
      return undefined;
    }
    return `https://github.com/${segments.join('/')}`;
  } catch {
    return undefined;
  }
}

export function createWarpkeepBuildInfo({
  productVersion,
  releaseChannel,
  buildSha,
  repositoryUrl
}: WarpkeepBuildInfoInput): WarpkeepBuildInfo {
  const version = readWarpkeepProductVersion(productVersion) ?? '0.0.0';
  const channel = normalizeWarpkeepReleaseChannel(releaseChannel);
  const fullSha = readWarpkeepBuildSha(buildSha);
  const repository = readWarpkeepRepositoryUrl(repositoryUrl) ?? DEFAULT_WARPKEEP_REPOSITORY_URL;

  return Object.freeze({
    channel,
    version,
    shortSha: fullSha?.slice(0, 7) ?? WARPKEEP_LOCAL_BUILD_LABEL,
    ...(fullSha ? { fullSha } : {}),
    ...(fullSha ? { commitUrl: `${repository}/commit/${fullSha}` } : {}),
    realm: WARPKEEP_REALM_SEED
  });
}

export function formatWarpkeepBuildStamp(buildInfo: WarpkeepBuildInfo) {
  const release = `${buildInfo.channel.toUpperCase()} ${buildInfo.version}`;
  return buildInfo.fullSha
    ? `${release} · BUILD ${buildInfo.shortSha}`
    : `${release} · ${WARPKEEP_LOCAL_BUILD_LABEL}`;
}

export const WARPKEEP_BUILD_INFO = createWarpkeepBuildInfo({
  productVersion: typeof __WARPKEEP_PRODUCT_VERSION__ === 'string'
    ? __WARPKEEP_PRODUCT_VERSION__
    : undefined,
  releaseChannel: import.meta.env.VITE_WARPKEEP_RELEASE_CHANNEL,
  buildSha: import.meta.env.VITE_WARPKEEP_BUILD_SHA,
  repositoryUrl: import.meta.env.VITE_WARPKEEP_REPOSITORY_URL
});
