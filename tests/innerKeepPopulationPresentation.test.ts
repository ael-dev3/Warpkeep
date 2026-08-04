import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInnerKeepPopulationPresentation } from '../src/components/inner-keep/createInnerKeepPopulationPresentation';
import { createInnerKeepAmbientSimulationPlan } from '../src/components/inner-keep/innerKeepAmbientTimeline';
import type { InnerKeepRuntimeAssetBundle } from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';

afterEach(() => vi.restoreAllMocks());

function emptyRuntimeBundle(): InnerKeepRuntimeAssetBundle {
  return Object.freeze({
    staticPrefabs: new Map(),
    populationPrefabs: new Map(),
    failures: Object.freeze([]),
    dispose: vi.fn(),
  });
}

describe('Inner Keep population terrain contact', () => {
  it('grounds every exterior pose on the shared deterministic terrain sampler', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const plan = createInnerKeepAmbientSimulationPlan({
      seed: 0x5e77_1e,
      quality: 'reduced',
      reducedMotion: true,
    });
    const terrainHeightAt = (x: number, z: number) => 0.4 + x * 0.01 - z * 0.005;
    const presentation = createInnerKeepPopulationPresentation({
      bundle: emptyRuntimeBundle(),
      plan,
      terrainHeightAt,
    });

    for (const elapsedSeconds of [0, 12.5, 83]) {
      presentation.update(elapsedSeconds);
      const frame = presentation.getFrame();
      for (const pose of frame.actors) {
        const actor = presentation.group.getObjectByName(
          `inner-keep-ambient-actor:${pose.actorId}`,
        );
        expect(actor, pose.actorId).toBeDefined();
        expect(actor!.position.y).toBeCloseTo(
          terrainHeightAt(pose.position.x, pose.position.z) + 0.13,
          8,
        );
      }
    }

    presentation.dispose();
  });

  it('keeps the legacy flat-ground default for isolated consumers', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const presentation = createInnerKeepPopulationPresentation({
      bundle: emptyRuntimeBundle(),
      plan: createInnerKeepAmbientSimulationPlan({
        seed: 7,
        quality: 'reduced',
        reducedMotion: true,
      }),
    });
    presentation.group.children.forEach((actor) => {
      expect(actor.position.y).toBeCloseTo(0.13, 8);
    });
    presentation.dispose();
  });
});
