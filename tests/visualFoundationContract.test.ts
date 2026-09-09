import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const contract = readFileSync(resolve(root, 'docs/agent-notes/0.4.0/visual-foundation-contract.md'), 'utf8');

describe('Warpkeep 0.4 visual foundation contract', () => {
  it('keeps the complete inspiration set represented by an explicit decision', () => {
    const referenceFamilies = [
      'Astra voxel engine',
      'Binary Greedy Meshing',
      'Verdant Forest',
      'EZ-Tree',
      'Pelagic',
      'Luminous Lake',
      'Dream Loop',
      'Selo Empire',
      'Widelands',
      'Townscaper',
      'Tiny Glade',
      'Mapgen4',
      'InstancedMesh2',
      'Razarion',
      'A Small World',
      'Dorfromantik',
      'Snowflow',
      'Desert Dusky',
      'The Long Silence',
      'Starfall',
      'Operation Ironhold',
      'FFXIV',
      'Fortnite',
      'Minecraft',
      'Forge of Empires',
      'Travian',
    ];
    for (const family of referenceFamilies) expect(contract).toContain(family);
    const supportingReferences = [
      'noa',
      'three-stylized',
      'stylized-components',
      'TUMBLE meadow',
      'Three.js Water Pro',
      'Vesper',
      'procedural terrain research',
      'SimonDev',
      'ZyFou',
      'Tectonic/uplift/erosion studies',
      'Priority-Flood',
      'tile-erosion evaluation',
      'Crytek height fog',
      'Three.js WebGPU',
      'TSL',
      'Grassworks',
      'Mistwood Cottage',
      'broader climate studies',
    ];
    for (const reference of supportingReferences) expect(contract).toContain(reference);
    expect(contract).toContain('deliberate deferral');
    expect(contract).toContain('not a runtime dependency');
    expect(contract).toContain('nothing was copied');
  });

  it('keeps mobile, accessibility, and evidence boundaries explicit', () => {
    const normalized = contract.toLowerCase().replace(/\s+/gu, ' ');
    for (const phrase of [
      'safe-area padding',
      'touch-sized action surface',
      'reduced motion',
      'hidden-page suspension',
      'schematic fallback',
      'portrait mobile',
      'short landscape',
      'physical-device results',
      'matching resolution',
    ]) expect(normalized).toContain(phrase.toLowerCase());

    for (const state of [
      'an empty keep',
      'a mature keep',
      'a placement choice',
      'construction underway',
      'a completed improvement',
      'a world-to-keep return',
    ]) expect(contract).toContain(state);
  });

  it('routes the contract to real 0.4 source owners', () => {
    const sourceOwners = [
      'src/components/keep04/keep04VisualProfile.ts',
      'src/components/keep04/createKeep04Buildings.ts',
      'src/components/keep04/createKeep04Scene.ts',
      'src/components/keep04/keep04VoxelDressing.ts',
      'src/components/keep04/Keep04Screen.tsx',
      'src/components/keep04/Keep04Screen.css',
      'src/components/keep04/Keep04BuildingPanel.tsx',
      'src/components/keep04/Keep04WorkerPanel.tsx',
      'src/greater-realm/greaterRealmWaterSurface.ts',
      'src/greater-realm/createGreaterRealmSceneRuntime.ts',
      'docs/evidence/0.4.0/visuals.md',
      'docs/evidence/0.4.0/performance.md',
      'docs/operations/0.4.0-release-checklist.md',
    ];
    for (const relativePath of sourceOwners) {
      expect(existsSync(resolve(root, relativePath)), relativePath).toBe(true);
      expect(contract).toContain(relativePath);
    }
  });
});
