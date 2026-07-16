import * as THREE from 'three';

import {
  disposeRealmObject,
  loadHegemonyKeep,
  type HegemonyKeepLoadResult,
  type HegemonyKeepParser
} from './loadHegemonyKeep';
import {
  loadHegemonyLandscapeBase,
  prepareHegemonyLandscapeBaseScene,
  type HegemonyLandscapeBaseLoadResult
} from './loadHegemonyLandscapeBase';
import type { RealmQualitySpec } from './realmQuality';

export type HegemonyCastleAssemblyLoadResult = HegemonyKeepLoadResult & Readonly<{
  landscapeBaseAssetUrl: string;
}>;

export type LoadHegemonyCastleAssemblyOptions = Readonly<{
  quality: RealmQualitySpec;
  baseUrl: string;
  maxAnisotropy: number;
  requestTimeoutMs?: number;
  keepParser?: HegemonyKeepParser;
  landscapeBaseParser?: HegemonyKeepParser;
  keepLoader?: () => Promise<HegemonyKeepLoadResult>;
  landscapeBaseLoader?: () => Promise<HegemonyLandscapeBaseLoadResult>;
}>;

function disposeSettledRoot(result: PromiseSettledResult<Readonly<{ root: THREE.Object3D }>>) {
  if (result.status !== 'fulfilled') return;
  try {
    disposeRealmObject(result.value.root);
  } catch {
    // Preserve the originating load failure even when a browser disposal path fails.
  }
}

/**
 * Adds the authored landscape model under the exact castle-derived transform.
 * The castle remains the sole source of normalization and camera/LOD sizing;
 * the wider island is retained only as render geometry and a conservative
 * presentation envelope downstream.
 */
export function assembleHegemonyCastleLandscapeBase(
  keep: HegemonyKeepLoadResult,
  landscapeBase: HegemonyLandscapeBaseLoadResult,
  options: Readonly<{ dynamicShadows: boolean; maxAnisotropy: number }>
): HegemonyCastleAssemblyLoadResult {
  const castleTransform = keep.root.children[0];
  if (!castleTransform) {
    throw new Error('Normalized Hegemony keep is missing its castle transform.');
  }
  const preparedBase = prepareHegemonyLandscapeBaseScene(
    landscapeBase.root,
    castleTransform,
    options
  );
  preparedBase.name = 'hegemony-castle-landscape-base';
  keep.root.add(preparedBase);
  keep.root.updateWorldMatrix(true, true);
  return Object.freeze({
    ...keep,
    landscapeBaseAssetUrl: landscapeBase.assetUrl
  });
}

export async function loadHegemonyCastleAssembly(
  options: LoadHegemonyCastleAssemblyOptions
): Promise<HegemonyCastleAssemblyLoadResult> {
  const keepRequest = options.keepLoader?.() ?? loadHegemonyKeep({
    quality: options.quality,
    baseUrl: options.baseUrl,
    maxAnisotropy: options.maxAnisotropy,
    requestTimeoutMs: options.requestTimeoutMs,
    parser: options.keepParser
  });
  const landscapeBaseRequest = options.landscapeBaseLoader?.()
    ?? loadHegemonyLandscapeBase({
      quality: options.quality,
      baseUrl: options.baseUrl,
      maxAnisotropy: options.maxAnisotropy,
      requestTimeoutMs: options.requestTimeoutMs,
      parser: options.landscapeBaseParser
    });
  const [keep, landscapeBase] = await Promise.allSettled([
    keepRequest,
    landscapeBaseRequest
  ] as const);
  if (keep.status === 'rejected' || landscapeBase.status === 'rejected') {
    disposeSettledRoot(keep);
    disposeSettledRoot(landscapeBase);
    if (keep.status === 'rejected') throw keep.reason;
    if (landscapeBase.status === 'rejected') throw landscapeBase.reason;
    throw new Error('Hegemony castle assembly failed without a rejection reason.');
  }

  let attached = false;
  try {
    const result = assembleHegemonyCastleLandscapeBase(
      keep.value,
      landscapeBase.value,
      {
        dynamicShadows: options.quality.dynamicShadows,
        maxAnisotropy: options.maxAnisotropy
      }
    );
    attached = true;
    return result;
  } catch (error) {
    try {
      disposeRealmObject(keep.value.root);
    } catch {
      // Preserve assembly validation as the primary error.
    }
    if (!attached && landscapeBase.value.root.parent !== keep.value.root) {
      try {
        disposeRealmObject(landscapeBase.value.root);
      } catch {
        // Preserve assembly validation as the primary error.
      }
    }
    throw error;
  }
}
