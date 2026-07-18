import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const CANDIDATE_DIRECTORY =
  'docs/reference/resources/2026-07-18-hegemony-gold-mine/runtime-candidates';
const CANDIDATES = [
  {
    id: 'high',
    filename: 'hegemony-gold-mine-high-6c3731e0f3381014.glb',
    bytes: 263_528,
    sha256: '6c3731e0f3381014d661d539c25f67e4f79f894b721d1feac9e275b07b8a6ab3',
    triangles: 4_233,
    actualTextureSize: 1_024,
    declaredAtlasSize: 1_024
  },
  {
    id: 'balanced',
    filename: 'hegemony-gold-mine-balanced-42776e6a0a1196c.glb',
    bytes: 154_388,
    sha256: '42776e6a0a1196c43e872d9d6d08a8acbf398b5dbd26ba7ab20e0c0cfdd52008',
    triangles: 3_553,
    actualTextureSize: 512,
    declaredAtlasSize: 1_024
  },
  {
    id: 'compact',
    filename: 'hegemony-gold-mine-compact-b39ad147954ba420.glb',
    bytes: 95_024,
    sha256: 'b39ad147954ba4200efe680975038416784f759918ca295282d95812710ca853',
    triangles: 2_681,
    actualTextureSize: 256,
    declaredAtlasSize: 1_024
  }
] as const;

function readGlbJson(path: string) {
  const bytes = readFileSync(path);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/u.test(entry.name) ? [path] : [];
  });
}

describe('Hegemony Gold Mine review candidates', () => {
  it('pins the complete supplied candidate family outside the Pages tree', () => {
    const candidateDirectory = resolve(ROOT, CANDIDATE_DIRECTORY);
    const candidateEntries = readdirSync(candidateDirectory, { withFileTypes: true });
    const candidateNames = candidateEntries.map(entry => entry.name).sort();
    expect(candidateNames).toEqual(CANDIDATES.map(candidate => candidate.filename).sort());
    expect(candidateEntries.every(entry => entry.isFile())).toBe(true);

    CANDIDATES.forEach((candidate) => {
      const path = resolve(candidateDirectory, candidate.filename);
      const bytes = readFileSync(path);
      expect(statSync(path).size).toBe(candidate.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(candidate.sha256);

      const json = readGlbJson(path);
      expect(json.asset).toMatchObject({ version: '2.0', generator: 'glTF-Transform v4.4.1' });
      expect(json.extensionsRequired).toEqual([
        'EXT_meshopt_compression',
        'EXT_texture_webp',
        'KHR_mesh_quantization'
      ]);
      expect(json.scenes).toHaveLength(1);
      expect(json.nodes).toHaveLength(1);
      expect(json.meshes).toHaveLength(1);
      expect(json.materials).toHaveLength(1);
      expect(json.images).toHaveLength(3);
      expect(json.animations ?? []).toHaveLength(0);
      const primitive = json.meshes[0].primitives[0];
      expect(json.accessors[primitive.indices].count / 3).toBe(candidate.triangles);
      expect(json.materials[0].extras.wk_atlas_size).toBe(candidate.declaredAtlasSize);
    });

    expect(existsSync(resolve(
      ROOT,
      'public/models/hegemony/gathering-nodes/gold-mine'
    ))).toBe(false);
  });

  it('records the known atlas-metadata discrepancy instead of treating it as runtime-ready', () => {
    const record = JSON.parse(readFileSync(resolve(
      ROOT,
      'docs/reference/resources/2026-07-18-hegemony-gold-mine/manifest.json'
    ), 'utf8'));
    expect(record.reviewStatus).toEqual(expect.objectContaining({
      state: 'prepared-not-integrated',
      runtimeDelivery: 'not-authorized',
      gameplayIntegration: 'not-authorized'
    }));
    expect(record.lods).toEqual(CANDIDATES.map(candidate => expect.objectContaining({
      id: candidate.id,
      candidateFilename: candidate.filename,
      bytes: candidate.bytes,
      sha256: candidate.sha256,
      actualTextureSize: candidate.actualTextureSize,
      declaredAtlasSize: candidate.declaredAtlasSize
    })));
    expect(record.lods[1].metadataStatus).toBe('review-gate-required');
    expect(record.lods[2].metadataStatus).toBe('review-gate-required');
  });

  it('does not wire any 3D candidate model into current browser presentation', () => {
    const clientSource = sourceFiles(resolve(ROOT, 'src'))
      .map(path => readFileSync(path, 'utf8'))
      .join('\n');
    expect(clientSource).not.toContain(CANDIDATE_DIRECTORY);
    expect(clientSource).not.toContain('runtime-candidates/hegemony-gold-mine-');
    CANDIDATES.forEach((candidate) => {
      expect(clientSource).not.toContain(candidate.filename);
    });
    expect(clientSource).not.toContain('public/models/hegemony/gathering-nodes/gold-mine');
  });
});
