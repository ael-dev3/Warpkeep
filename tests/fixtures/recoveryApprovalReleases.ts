import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  createGreaterRealmRuntimeReleaseFixtureSource,
  greaterRealmRuntimeReleaseFixtureSeed,
  GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
} from '../../scripts/atlas/greater-realm-runtime-release-test-fixture';
import {
  createGenesis002GreaterRealmRuntimeRelease,
  createPtrGreaterRealmRuntimeRelease,
  GENESIS_002_GREATER_REALM_RUNTIME_RELEASE_DIRECTORY,
  PTR_GREATER_REALM_RUNTIME_RELEASE_DIRECTORY,
  verifyGenesis002GreaterRealmRuntimeReleaseArtifacts,
  verifyPtrGreaterRealmRuntimeReleaseArtifacts,
} from '../../scripts/atlas/greater-realm-runtime-release';
import { greaterRealmProductionImportEngine } from '../../scripts/greater-realm-production-import-core';

/** Real deterministic release producers and validators; no approval-reader substitute. */
export function createRecoveryApprovalReleaseFixture(workspaceRoot: string) {
  mkdirSync(workspaceRoot, { recursive: true, mode: 0o700 });
  const options = {
    source: createGreaterRealmRuntimeReleaseFixtureSource(),
    sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
    releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(),
  };
  const g002 = createGenesis002GreaterRealmRuntimeRelease(options);
  const ptr = createPtrGreaterRealmRuntimeRelease(options);
  for (const [directory, artifacts] of [
    [GENESIS_002_GREATER_REALM_RUNTIME_RELEASE_DIRECTORY, g002],
    [PTR_GREATER_REALM_RUNTIME_RELEASE_DIRECTORY, ptr],
  ] as const) {
    for (const [path, bytes] of [
      ['import-manifest.json', artifacts.manifestBytes],
      ['status.json', artifacts.statusBytes],
      ...artifacts.chunks.map((chunk) => [chunk.path, chunk.bytes] as const),
    ] as const) {
      const file = join(workspaceRoot, directory, path);
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      writeFileSync(file, bytes, { mode: 0o600 });
    }
  }
  const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const ga = greaterRealmProductionImportEngine.importAuthority(
    g002,
    verifyGenesis002GreaterRealmRuntimeReleaseArtifacts,
  );
  const pa = greaterRealmProductionImportEngine.importAuthority(
    ptr,
    verifyPtrGreaterRealmRuntimeReleaseArtifacts,
  );
  return Object.freeze({
    workspaceRoot,
    g002: ga,
    ptr: pa,
    g002HeaderSha256: hash(ga.headerJson),
    ptrHeaderSha256: hash(pa.headerJson),
    ptrManifestSha256: hash(ptr.manifestBytes),
  });
}
