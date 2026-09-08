// @vitest-environment node
import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  fstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ root: '', cleanups: 0, verify: 0 }));
vi.mock('../scripts/spacetime-cli-attestation.mjs', () => ({
  attestPinnedSpacetimeCli: () => ({
    path: join(state.root, 'cli'),
    directory: state.root,
    digest: 'e'.repeat(64),
    provenance: { standaloneExecutableSha256: 'b'.repeat(64) },
    verify: () => {
      state.verify++;
    },
    cleanup: () => {
      state.cleanups++;
    },
  }),
}));
vi.mock('../scripts/ptr-binding-linux-locked-source-build.ts', () => ({
  withPtrLinuxLockedSourceBuild: ({ operation }: any) => ({
    result: operation({ materializedRoot: state.root }),
    moduleTreeId: 'c'.repeat(40),
    dependencyClosureDigest: 'd'.repeat(64),
  }),
}));
import { preparePtrSourceBuiltArtifact } from '../scripts/ptr-production-publisher.mjs';
const schema = readFileSync(
  new URL(
    './fixtures/ptr-artifact-description-2.6.1/first.json',
    import.meta.url,
  ),
);
const reducers = [
  'admin_begin_greater_realm_verification_v1',
  'admin_finalize_greater_realm_release_v1',
  'admin_import_greater_realm_chunk_v1',
  'admin_import_greater_realm_components_v1',
  'admin_import_greater_realm_regions_v1',
  'admin_provision_ptr_owner_v1',
  'admin_stage_greater_realm_release_v1',
  'admin_suspend_ptr_owner_v1',
  'admin_verify_greater_realm_batch_v1',
];
const procedures = [
  'admin_get_greater_realm_status_v1',
  'dispatch_gameplay04_worker_v1',
  'get_gameplay04_keep_v1',
  'get_ptr_owner_status_v1',
  'get_realm_atlas_bootstrap_v1',
  'get_realm_atlas_chunk_v1',
  'get_realm_atlas_resource_locations_v1',
  'get_realm_atlas_window_v1',
  'initialize_gameplay04_keep_v1',
  'plan_realm_route_v1',
  'recall_gameplay04_worker_v1',
  'start_gameplay04_building_v1',
];
describe.skipIf(process.platform !== 'linux' || process.arch !== 'x64')(
  'publisher owned description path',
  () => {
    it.each(['success', 'status', 'throw'])(
      'attaches exact artifact description or cleans failed extraction (%s)',
      (failure) => {
        state.root = mkdtempSync(join(tmpdir(), 'warpkeep-description-test-'));
        state.cleanups = 0;
        state.verify = 0;
        let descriptor = -1;
        let extractionCalls = 0;
        const artifact = Buffer.from('actual immutable test artifact');
        const spawn = (_exe: any, args: any, options: any) => {
          if (args[0] === 'build') {
            const dir = join(state.root, 'spacetimedb/ptr/dist');
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, 'bundle.js'), artifact);
            return { status: 0, stdout: '', stderr: '' };
          }
          if (args[0] === 'generate') {
            writeFileSync(
              join(args.at(-1), 'index.ts'),
              reducers.map((n) => `__reducerSchema("${n}")`).join('\n') +
                procedures.map((n) => `__procedureSchema("${n}")`).join('\n'),
            );
            return { status: 0, stdout: '', stderr: '' };
          }
          if (args[0] === 'extract-schema') {
            extractionCalls++;
            descriptor = options.stdio[3];
            if (failure === 'throw')
              throw new Error('spawn failed synchronously');
            expect(readFileSync(`/proc/self/fd/${descriptor}`)).toEqual(
              artifact,
            );
            return {
              status: failure === 'status' ? 1 : 0,
              stdout: schema,
              stderr: Buffer.alloc(0),
            };
          }
          throw Error('unexpected command');
        };
        try {
          const prepare = () =>
            preparePtrSourceBuiltArtifact({
              sourceCommit: 'a'.repeat(40),
              reattestSource: () => 'a'.repeat(40),
              dependencyCacheRoot: state.root,
              spawn,
            });
          if (failure !== 'success') {
            expect(prepare).toThrow();
            expect(state.cleanups).toBe(1);
            expect(() => fstatSync(descriptor)).toThrow();
          } else {
            const result = prepare();
            try {
              expect(result.artifactDescription.artifactSha256).toBe(
                createHash('sha256').update(artifact).digest('hex'),
              );
              expect(
                result.artifactDescription.definition.sections.length,
              ).toBeGreaterThan(0);
              expect(result.artifactDescription.rawExtractionSha256).toBe(
                createHash('sha256').update(schema).digest('hex'),
              );
              expect(
                Object.isFrozen(result.artifactDescription.definition),
              ).toBe(true);
            } finally {
              result.cleanup();
              result.cleanup();
            }
            expect(existsSync(result.artifactPath)).toBe(false);
            expect(state.cleanups).toBe(1);
          }
          expect(extractionCalls).toBe(1);
        } finally {
          rmSync(state.root, { recursive: true, force: true });
        }
      },
    );
  },
);
