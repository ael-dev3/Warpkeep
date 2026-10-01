import type {
  WarpkeepBuildInfo,
  WarpkeepBuildInfoInput,
  WarpkeepReleaseChannel
} from './buildInfoTypes';
import {
  PTR_RELEASE_VERSION,
  WARPKEEP_LAUNCHER_RELEASE_VERSION
} from '../release/realmReleaseIdentity';

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
  // The owning source repository is private. Keep its exact build identity,
  // without offering public players a commit link that returns 404.
  const commitUrl = fullSha && repository.toLowerCase() !== DEFAULT_WARPKEEP_REPOSITORY_URL.toLowerCase()
    ? `${repository}/commit/${fullSha}`
    : undefined;

  return Object.freeze({
    channel,
    version,
    shortSha: fullSha?.slice(0, 7) ?? WARPKEEP_LOCAL_BUILD_LABEL,
    ...(fullSha ? { fullSha } : {}),
    ...(commitUrl ? { commitUrl } : {}),
    realm: WARPKEEP_REALM_SEED
  });
}

export function createWarpkeepDeploymentBuildInfo({
  deploymentBase,
  ...input
}: WarpkeepBuildInfoInput & Readonly<{ deploymentBase: string }>) {
  return createWarpkeepBuildInfo({
    ...input,
    productVersion: deploymentBase === '/ptr/'
      ? PTR_RELEASE_VERSION
      : input.productVersion
  });
}

export function formatWarpkeepBuildStamp(buildInfo: WarpkeepBuildInfo) {
  const release = `${buildInfo.channel.toUpperCase()} ${buildInfo.version}`;
  return buildInfo.fullSha
    ? `${release} · BUILD ${buildInfo.shortSha}`
    : `${release} · ${WARPKEEP_LOCAL_BUILD_LABEL}`;
}

const packagedBuildInfo = createWarpkeepDeploymentBuildInfo({
  deploymentBase: import.meta.env.BASE_URL,
  productVersion: typeof __WARPKEEP_PRODUCT_VERSION__ === 'string'
    ? __WARPKEEP_PRODUCT_VERSION__
    : undefined,
  releaseChannel: import.meta.env.VITE_WARPKEEP_RELEASE_CHANNEL,
  buildSha: import.meta.env.VITE_WARPKEEP_BUILD_SHA,
  repositoryUrl: import.meta.env.VITE_WARPKEEP_REPOSITORY_URL
});

// Keep the unapproved sealed-launch package at 0.3.43 while previewing the
// 0.4 presentation locally. Public builds always expose the package version.
export const WARPKEEP_BUILD_INFO = import.meta.env.DEV
  ? createWarpkeepBuildInfo({
      productVersion: WARPKEEP_LAUNCHER_RELEASE_VERSION,
      releaseChannel: import.meta.env.VITE_WARPKEEP_RELEASE_CHANNEL,
      buildSha: import.meta.env.VITE_WARPKEEP_BUILD_SHA,
      repositoryUrl: import.meta.env.VITE_WARPKEEP_REPOSITORY_URL
    })
  : packagedBuildInfo;
