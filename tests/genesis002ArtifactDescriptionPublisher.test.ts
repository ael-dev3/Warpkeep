// @vitest-environment node
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, fstatSync, mkdirSync, mkdtempSync, readFileSync, readSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ root: '', cleanups: 0, cliChanged: false }));
vi.mock('../scripts/spacetime-cli-attestation.mjs', () => ({
  attestPinnedSpacetimeCli: () => ({ path: join(state.root, 'cli'), directory: state.root, digest: 'e'.repeat(64),
    provenance: { standaloneExecutableSha256: 'b'.repeat(64) },
    verify: () => { if (state.cliChanged) throw new Error('CLI changed'); }, cleanup: () => { state.cleanups++; } }),
}));
vi.mock('../scripts/genesis002-binding-linux-locked-source-build.ts', () => ({
  withGenesis002LinuxLockedSourceBuild: ({ operation }: { operation: (context: { materializedRoot: string }) => unknown }) => ({
    result: operation({ materializedRoot: state.root }), moduleTreeId: 'c'.repeat(40), dependencyClosureDigest: 'd'.repeat(64),
  }),
}));
import * as publisher from '../scripts/genesis002-production-publisher.mjs';

// Reuse an official complete RawV10 extraction as a realm-neutral grammar fixture.
// The mocked extraction below does not claim that these are deployed G002 bytes.
const schema = readFileSync(new URL('./fixtures/ptr-artifact-description-2.6.1/first.json', import.meta.url));
const privateBindings = readFileSync(new URL('../scripts/genesis002_module_bindings/index.ts', import.meta.url), 'utf8');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const describeArtifact = async (input: Record<string, unknown>) => (await import('../scripts/genesis002-artifact-description.mjs'))
  .describeGenesis002Artifact(input as never);
afterEach(() => { vi.restoreAllMocks(); });

it('retains the complete canonical RawV10 under a G002 artifact descriptor', async () => {
  const cli = { directory: resolve('artifacts'), provenance: { standaloneExecutableSha256: 'b'.repeat(64) }, verify: vi.fn() };
  const assertArtifact = vi.fn();
  const spawn = vi.fn(() => ({ status: 0, stdout: schema, stderr: Buffer.alloc(0) }));
  await expect(describeArtifact({ artifactDescriptor: 3, artifactSha256: 'a'.repeat(64), cli, assertArtifact, spawn })).resolves.toMatchObject({
    profile: 'warpkeep-genesis002-artifact-description-v1', artifactSha256: 'a'.repeat(64), rawModuleDefVersion: 10,
    standaloneExecutableSha256: 'b'.repeat(64), rawExtractionSha256: sha(schema),
    canonicalizationProfile: 'warpkeep-raw-v10-normalized-no-views-rls-http-defaults-v1',
    definition: { sections: expect.arrayContaining([expect.objectContaining({ Procedures: expect.any(Array) }), expect.objectContaining({ Tables: expect.any(Array) })]) },
  });
  expect(spawn.mock.calls[0]).toEqual([join(cli.directory, 'spacetimedb-standalone'), ['extract-schema', '/dev/fd/3', '--host-type', 'js'],
    expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe', 3], cwd: cli.directory })]);
  expect(cli.verify).toHaveBeenCalledTimes(2); expect(assertArtifact).toHaveBeenCalledTimes(2);
});

it.each(['unknown-section', 'cli-changed', 'artifact-changed', 'extraction-failed'] as const)(
  'refuses G002 description when %s without exposing dependency errors', async problem => {
    const raw = JSON.parse(schema.toString()); if (problem === 'unknown-section') raw.V10.sections.push({ Unknown: [] });
    const check = (condition: boolean) => { if (condition) throw new Error('private dependency diagnostic'); };
    await expect(describeArtifact({ artifactDescriptor: 3, artifactSha256: 'a'.repeat(64),
      cli: { directory: resolve('artifacts'), provenance: { standaloneExecutableSha256: 'b'.repeat(64) }, verify: () => check(problem === 'cli-changed') },
      assertArtifact: () => check(problem === 'artifact-changed'),
      spawn: () => ({ status: problem === 'extraction-failed' ? 1 : 0, stdout: Buffer.from(JSON.stringify(raw)), stderr: Buffer.alloc(0) }),
    })).rejects.toThrow('GENESIS_002_ARTIFACT_DESCRIPTION_INVALID');
  },
);

describe.skipIf(process.platform !== 'linux' || process.arch !== 'x64')('G002 owned artifact lifecycle on native filesystem', () => {
  it.each(['success', 'extraction-status', 'extraction-throw', 'source-changed', 'artifact-changed', 'cli-changed'] as const)(
    'binds copied bytes, full description and source ownership or closes failed preparation (%s)', failure => {
      state.root = mkdtempSync(join(tmpdir(), 'warpkeep-g002-artifact-test-'));
      state.cleanups = 0; state.cliChanged = false;
      const source = 'a'.repeat(40); let current = source; let descriptor = -1; let artifactPath = '';
      const bytes = Buffer.from('abc');
      const spawn = (_executable: unknown, args: string[], options: { stdio?: unknown[] }) => {
        if (args[0] === 'build') {
          const output = join(state.root, 'spacetimedb/genesis002/dist'); mkdirSync(output, { recursive: true });
          writeFileSync(join(output, 'bundle.js'), bytes); return { status: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'generate') {
          artifactPath = args[args.indexOf('--js-path') + 1];
          writeFileSync(join(args.at(-1)!, 'index.ts'), args.includes('--include-private') ? privateBindings : '');
          return { status: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'extract-schema') {
          descriptor = options.stdio![3] as number;
          const observed = Buffer.alloc(3); expect(readSync(descriptor, observed, 0, 3, 0)).toBe(3); expect(observed).toEqual(bytes);
          if (failure === 'extraction-throw') throw new Error('private spawn diagnostic');
          if (failure === 'source-changed') current = 'f'.repeat(40);
          if (failure === 'artifact-changed') { chmodSync(artifactPath, 0o600); writeFileSync(artifactPath, 'xyz'); chmodSync(artifactPath, 0o400); }
          if (failure === 'cli-changed') state.cliChanged = true;
          return { status: failure === 'extraction-status' ? 1 : 0, stdout: schema, stderr: Buffer.alloc(0) };
        }
        throw new Error('unexpected command');
      };
      try {
        const prepare = () => publisher.prepareGenesis002SourceBuiltArtifact({ sourceCommit: source, reattestSource: () => current,
          dependencyCacheRoot: state.root, materializationParent: state.root, spawn: spawn as never });
        if (failure !== 'success') {
          expect(prepare).toThrow(); expect(descriptor).toBeGreaterThanOrEqual(0);
          expect(() => fstatSync(descriptor)).toThrow(); expect(existsSync(artifactPath)).toBe(false);
        } else {
          const artifact = prepare();
          try {
            expect(publisher.assertGenesis002SourceBuiltArtifact(artifact)).toBe(artifact);
            expect(artifact).toMatchObject({ sourceCommit: source, moduleTreeId: 'c'.repeat(40), dependencyClosureDigest: 'd'.repeat(64),
              moduleSha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
              moduleProgramHash: '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45',
              artifactDescription: { profile: 'warpkeep-genesis002-artifact-description-v1', artifactSha256: sha(bytes), rawExtractionSha256: sha(schema) } });
            expect(Object.isFrozen(artifact)).toBe(true); expect(Object.isFrozen(artifact.artifactDescription.definition.sections)).toBe(true);
            expect(() => publisher.assertGenesis002SourceBuiltArtifact({ ...artifact })).toThrow('GENESIS_002_ARTIFACT_CAPABILITY_INVALID');
            current = 'f'.repeat(40); expect(() => publisher.assertGenesis002SourceBuiltArtifact(artifact)).toThrow('GENESIS_002_PROTECTED_MAIN_ADVANCED'); current = source;
            state.cliChanged = true; expect(() => publisher.assertGenesis002SourceBuiltArtifact(artifact)).toThrow('CLI changed'); state.cliChanged = false;
            chmodSync(artifact.artifactPath, 0o600); writeFileSync(artifact.artifactPath, 'xyz'); chmodSync(artifact.artifactPath, 0o400);
            expect(() => publisher.assertGenesis002SourceBuiltArtifact(artifact)).toThrow('GENESIS_002_IMMUTABLE_ARTIFACT_CHANGED');
          } finally { artifact.cleanup(); artifact.cleanup(); }
          expect(() => publisher.assertGenesis002SourceBuiltArtifact(artifact)).toThrow('GENESIS_002_ARTIFACT_CAPABILITY_INVALID');
          expect(existsSync(artifact.artifactPath)).toBe(false);
        }
        expect(state.cleanups).toBe(1);
      } finally {
        const target = resolve(state.root);
        if (!target.startsWith(resolve(tmpdir()) + '/') || !target.split('/').at(-1)?.startsWith('warpkeep-g002-artifact-test-')) throw new Error('fixture cleanup boundary');
        rmSync(target, { recursive: true, force: true });
      }
    },
  );
});
