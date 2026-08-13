import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir, userInfo } from 'node:os';
import { dirname, join, win32 as win32Path } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertGreaterRealmPrivateInvocation,
  defaultGreaterRealmPrivateWorkspaceRoot,
  greaterRealmPrivateWorkspaceTestSeams,
  openGreaterRealmPrivateWorkspace,
} from '../scripts/atlas/greater-realm-private-workspace';
import { encodeGreaterRealmPrivateSeed } from '../scripts/atlas/greater-realm-private-seed';
import {
  GREATER_REALM_PROOF_KEYS,
  type GreaterRealmSanitizedCandidateSource,
  type GreaterRealmSanitizedReviewSource,
} from '../scripts/atlas/greater-realm-contracts';
import {
  createGreaterRealmSanitizedReview,
  serializeGreaterRealmSanitizedReview,
} from '../scripts/atlas/greater-realm-sanitized-review';
import {
  createGreaterRealmPendingOwnerReport,
  serializeGreaterRealmPendingOwnerReport,
} from '../scripts/atlas/greater-realm-pending-owner-report';

// @ts-expect-error Executable ESM verifier exposes named test seams.
import { verifyGreaterRealmPublicBoundary } from '../scripts/atlas/verify-public-boundary.mjs';

const temporaryRoots: string[] = [];

function isolatedPaths() {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-greater-realm-boundary-'));
  temporaryRoots.push(root);
  const repositoryRoot = join(root, 'repository');
  const workspaceRoot = join(root, 'private-workspace');
  mkdirSync(repositoryRoot, { mode: 0o700 });
  return { repositoryRoot, root, workspaceRoot };
}

function secretShapedCanonicalDirectory(): string {
  const canonicalTemporaryRoot = realpathSync(
    process.platform === 'win32' ? tmpdir() : '/tmp',
  );
  const suffixLength = 43 - canonicalTemporaryRoot.length - 1;
  if (
    suffixLength < 1
    || !/^[A-Za-z0-9+/_-]+$/u.test(canonicalTemporaryRoot)
  ) throw new Error('GREATER_REALM_TEST_SECRET_SHAPED_PATH_UNAVAILABLE');
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const suffix = `${randomUUID().replaceAll('-', '')}${'A'.repeat(43)}`
      .slice(0, suffixLength);
    const path = join(canonicalTemporaryRoot, suffix);
    if (existsSync(path)) continue;
    mkdirSync(path, { mode: 0o700 });
    if (!/^[A-Za-z0-9+/_-]{43}$/u.test(path) || realpathSync(path) !== path) {
      rmSync(path, { force: true, recursive: true });
      break;
    }
    temporaryRoots.push(path);
    return path;
  }
  throw new Error('GREATER_REALM_TEST_SECRET_SHAPED_PATH_UNAVAILABLE');
}

function scannerRepository() {
  const paths = isolatedPaths();
  for (const directory of ['public', 'src', 'dist', 'docs']) {
    mkdirSync(join(paths.repositoryRoot, directory));
  }
  writeFileSync(join(paths.repositoryRoot, 'public', 'ordinary.txt'), 'ordinary fixture\n');
  return paths;
}

function prefixedEmptyZipFixture(): Buffer {
  const prefix = Buffer.alloc(1_024, 0x90);
  const name = Buffer.from('a', 'ascii');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(name.length, 26);
  const centralOffset = prefix.length + local.length + name.length;
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(prefix.length, 42);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([prefix, local, name, central, name, end]);
}

function encodedAuthorityFixture(
  field: string,
  width: 1 | 2 | 4,
  bigEndian = false,
): Buffer {
  if (width === 1) return Buffer.from(field, 'utf8');
  if (width === 2) {
    const bytes = Buffer.from(field, 'utf16le');
    if (bigEndian) bytes.swap16();
    return bytes;
  }
  const bytes = Buffer.allocUnsafe([...field].length * 4);
  [...field].forEach((character, index) => {
    const value = character.codePointAt(0)!;
    if (bigEndian) bytes.writeUInt32BE(value, index * 4);
    else bytes.writeUInt32LE(value, index * 4);
  });
  return bytes;
}

function sanitizedReviewEvidence(): string {
  const candidates = Array.from({ length: 1 }, (_, index) => Object.freeze({
    candidateHandle: `GR-A-${String.fromCharCode(65 + index)}AAAAAAAAAAAAAAA`,
    eligible: true,
    activeCellCount: 120_000,
    landCellCount: 80_000,
    waterCellCount: 40_000,
    tierCellCounts: Object.freeze({ tierI: 86_400, tierII: 28_800, tierIII: 4_800 }),
    regionSizeRanges: Object.freeze({
      tierI: Object.freeze({ minimum: 14_000, maximum: 15_000 }),
      tierII: Object.freeze({ minimum: 9_000, maximum: 10_000 }),
      tierIII: Object.freeze({ minimum: 4_800, maximum: 4_800 }),
    }),
    hydrology: Object.freeze({
      majorOceanSeaBodies: 5,
      majorRivers: 60,
      minorStreams: 180,
      lakes: 72,
    }),
    geology: Object.freeze({
      pseudoTectonicDomains: 10,
      mountainSystems: 14,
      watersheds: 60,
    }),
    topography: Object.freeze({
      signedElevationMinimum: -18_400,
      signedElevationMaximum: 31_600,
      slopeP50: 420,
      slopeP95: 3_900,
      ridgeCellCount: 9_200,
      plateauCellCount: 11_400,
      basinCellCount: 8_600,
      coastCellCount: 4_800,
    }),
    biomes: Object.freeze({
      visualClassCount: 14,
      minimumPerRegionVisualClassCount: 4,
      minimumTierIVisualClassCount: 6,
      minimumTierIIVisualClassCount: 5,
      tierIIIVisualClassCount: 4,
      minimumTierIMajorVisualClassCount: 4,
      minimumTierITransitionVisualClassCount: 2,
      minimumTierIIMajorVisualClassCount: 5,
      tierIIIMajorVisualClassCount: 3,
      maximumTierISingleBiomeShareBasisPoints: 3_800,
      incompatibleVisualAdjacencyCount: 0,
      incompatibleBiomeLandformPairCount: 0,
    }),
    quality: Object.freeze({
      naturalnessBasisPoints: 8_720,
      axialArtifactBasisPoints: 410,
      ridgeContinuityBasisPoints: 8_440,
      hydrologyCoherenceBasisPoints: 9_010,
    }),
    gateCount: 18,
    castleSlotCount: 600,
    proofs: Object.freeze(Object.fromEntries(
      GREATER_REALM_PROOF_KEYS.map(key => [key, true]),
    )) as GreaterRealmSanitizedCandidateSource['proofs'],
    performance: Object.freeze({
      generationMillisecondsRounded: 180_000,
      processPeakMemoryMiBRounded: 768,
    }),
  })) as GreaterRealmSanitizedCandidateSource[];
  const source: GreaterRealmSanitizedReviewSource = Object.freeze({
    generatorVersion: 'greater-realm-v2-natural-continent',
    sourceCommit: 'a'.repeat(40),
    reviewBatchHandle: 'GR-B-AAAAAAAAAAAAAAAA',
    selectionStatus: 'pending',
    selectedCandidateHandle: null,
    candidates: Object.freeze(candidates),
  });
  return serializeGreaterRealmSanitizedReview(createGreaterRealmSanitizedReview(source));
}

function pendingOwnerReviewEvidence(): string {
  const sanitizedReview = JSON.parse(sanitizedReviewEvidence());
  return serializeGreaterRealmPendingOwnerReport(
    createGreaterRealmPendingOwnerReport({
      sanitizedReview,
      privatePackageVerified: true,
    }),
  );
}

function runFixtureGit(repositoryRoot: string, arguments_: string[]) {
  const nullPath = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const environment: NodeJS.ProcessEnv = {
    GIT_CONFIG_GLOBAL: nullPath,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    LANG: 'C',
    LC_ALL: 'C',
    PATH: process.env.PATH,
  };
  if (process.platform === 'win32') {
    environment.SystemRoot = process.env.SystemRoot ?? 'C:\\Windows';
    environment.WINDIR = process.env.WINDIR ?? 'C:\\Windows';
  }
  const result = spawnSync(
    'git',
    ['--no-pager', '-c', `core.hooksPath=${nullPath}`, ...arguments_],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: environment,
      shell: false,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0 || result.signal !== null) {
    throw new Error('GREATER_REALM_TEST_GIT_SETUP_FAILED');
  }
}

function writeProbeExecutable(directory: string, name: string, markerPath: string) {
  mkdirSync(directory, { recursive: true });
  if (process.platform === 'win32') {
    const path = join(directory, `${name}.cmd`);
    writeFileSync(
      path,
      `@echo off\r\ntype nul > "${markerPath.replaceAll('"', '""')}"\r\nexit /b 0\r\n`,
    );
    return path;
  }
  const path = join(directory, name);
  writeFileSync(
    path,
    `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'ran');\n`,
    { mode: 0o700 },
  );
  chmodSync(path, 0o700);
  return path;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('Greater Realm private generation workspace', () => {
  it('derives the canonical private root from the OS account, not hostile HOME', () => {
    const priorHome = process.env.HOME;
    process.env.HOME = '/tmp/hostile-greater-realm-home';
    try {
      expect(defaultGreaterRealmPrivateWorkspaceRoot()).toBe(join(
        userInfo().homedir,
        '.warpkeep',
        'private',
        'greater-realm',
      ));
      expect(defaultGreaterRealmPrivateWorkspaceRoot()).not.toContain(
        '/tmp/hostile-greater-realm-home',
      );
    } finally {
      if (priorHome === undefined) delete process.env.HOME;
      else process.env.HOME = priorHome;
    }
  });

  it('keeps every owner-only package basename ignored by Git', () => {
    const ignore = readFileSync(join(import.meta.dirname, '..', '.gitignore'), 'utf8')
      .split(/\r?\n/u);
    expect(ignore).toEqual(expect.arrayContaining([
      'seed.bin',
      'batch-seed.bin',
      'manifest.private.json',
      'batch.private.json',
      'selection.private.json',
      'shortlist.private.json',
    ]));
  });

  it('writes immutable owner-only files atomically outside the repository', () => {
    const paths = isolatedPaths();
    const workspace = openGreaterRealmPrivateWorkspace(paths);
    workspace.ensureDirectory('batches/review-one');
    const bytes = Uint8Array.from({ length: 96 }, (_, index) => (index * 17) & 0xff);

    workspace.writeFileAtomic('batches/review-one/checkpoint.wk-private-test', bytes);

    expect(workspace.readFile('batches/review-one/checkpoint.wk-private-test'))
      .toEqual(Buffer.from(bytes));
    expect(statSync(workspace.root).mode & 0o077).toBe(0);
    expect(statSync(join(
      workspace.root,
      'batches/review-one/checkpoint.wk-private-test',
    )).mode & 0o077).toBe(0);
    expect(workspace.attestTree()).toMatchObject({ fileCount: 1, byteCount: bytes.length });
    expect(() => workspace.writeFileAtomic(
      'batches/review-one/checkpoint.wk-private-test',
      bytes,
    )).toThrow('GREATER_REALM_PRIVATE_DESTINATION_EXISTS');
  });

  it('publishes a complete private directory in one transaction', async () => {
    const paths = isolatedPaths();
    const workspace = openGreaterRealmPrivateWorkspace(paths);
    const batch = 'batches/review-staged';
    const destination = join(workspace.root, batch);
    const first = Uint8Array.from([11, 22, 33]);
    const second = Uint8Array.from([44, 55, 66]);

    const result = await workspace.withAtomicDirectoryPublish(batch, async staged => {
      expect(existsSync(destination)).toBe(false);
      staged.writeFileAtomic(`${batch}/first.bin`, first);
      staged.writeFileAtomic(`${batch}/nested/second.bin`, second);
      expect(staged.readFile(`${batch}/first.bin`)).toEqual(Buffer.from(first));
      expect(existsSync(destination)).toBe(false);
      return 'published';
    });

    expect(result).toBe('published');
    expect(workspace.readFile(`${batch}/first.bin`)).toEqual(Buffer.from(first));
    expect(workspace.readFile(`${batch}/nested/second.bin`)).toEqual(Buffer.from(second));
    const envelopeEntries = readdirSync(destination).sort();
    const payloadName = envelopeEntries.find(name => name.startsWith('.wk-publish-payload-'));
    expect(payloadName).toMatch(/^\.wk-publish-payload-/u);
    expect(envelopeEntries).toEqual([
      '.wk-publish-commit-v1',
      '.wk-publish-envelope-v1',
      payloadName,
    ].sort());
    expect(readFileSync(join(destination, payloadName!, 'first.bin'))).toEqual(Buffer.from(first));
    workspace.writeFileAtomic(`${batch}/post-publication.bin`, Uint8Array.of(77));
    expect(workspace.readFile(`${batch}/post-publication.bin`)).toEqual(Buffer.from([77]));
    expect(readFileSync(join(destination, payloadName!, 'post-publication.bin')))
      .toEqual(Buffer.from([77]));
    expect(readdirSync(join(workspace.root, '.pending'))).toEqual([]);
  });

  it('removes every staged file when a private package operation fails', async () => {
    const paths = isolatedPaths();
    const workspace = openGreaterRealmPrivateWorkspace(paths);
    const batch = 'batches/review-failed';

    await expect(workspace.withAtomicDirectoryPublish(batch, async staged => {
      staged.writeFileAtomic(`${batch}/batch-seed.bin`, Uint8Array.from([1, 2, 3]));
      staged.writeFileAtomic(`${batch}/candidate/atlas.bin`, Uint8Array.from([4, 5, 6]));
      throw new Error('CONTROLLED_PRIVATE_PACKAGE_FAILURE');
    })).rejects.toThrow('CONTROLLED_PRIVATE_PACKAGE_FAILURE');

    expect(existsSync(join(workspace.root, batch))).toBe(false);
    expect(readdirSync(join(workspace.root, '.pending'))).toEqual([]);
  });

  it('confines a staged workspace to its exact publication subtree', async () => {
    const paths = isolatedPaths();
    const workspace = openGreaterRealmPrivateWorkspace(paths);
    const batch = 'batches/review-confined';

    await expect(workspace.withAtomicDirectoryPublish(batch, async staged => {
      staged.writeFileAtomic('batches/review-other/escape.bin', Uint8Array.of(1));
    })).rejects.toThrow('GREATER_REALM_PRIVATE_STAGING_SCOPE_INVALID');

    expect(existsSync(join(workspace.root, batch))).toBe(false);
    expect(readdirSync(join(workspace.root, '.pending'))).toEqual([]);
  });

  it('never replaces an existing private publication directory', async () => {
    const paths = isolatedPaths();
    const workspace = openGreaterRealmPrivateWorkspace(paths);
    const batch = 'batches/review-existing';
    workspace.writeFileAtomic(`${batch}/sentinel.bin`, Uint8Array.of(91));
    let entered = false;

    await expect(workspace.withAtomicDirectoryPublish(batch, async () => {
      entered = true;
    })).rejects.toThrow('GREATER_REALM_PRIVATE_DESTINATION_EXISTS');

    expect(entered).toBe(false);
    expect(workspace.readFile(`${batch}/sentinel.bin`)).toEqual(Buffer.from([91]));
  });

  it('never replaces an empty destination created while a package is staged', async () => {
    const paths = isolatedPaths();
    const workspace = openGreaterRealmPrivateWorkspace(paths);
    const batch = 'batches/review-concurrent-destination';
    const destination = join(workspace.root, batch);

    await expect(workspace.withAtomicDirectoryPublish(batch, async staged => {
      staged.writeFileAtomic(`${batch}/candidate.bin`, Uint8Array.of(7, 8, 9));
      mkdirSync(destination, { mode: 0o700 });
    })).rejects.toThrow('GREATER_REALM_PRIVATE_DESTINATION_EXISTS');

    expect(statSync(destination).isDirectory()).toBe(true);
    expect(readdirSync(destination)).toEqual([]);
    expect(readdirSync(join(workspace.root, '.pending'))).toEqual([]);
    expect(readdirSync(join(workspace.root, 'batches')))
      .toEqual(['review-concurrent-destination']);
  });

  it('fails closed when a private publication envelope has no commit marker', () => {
    const paths = isolatedPaths();
    const workspace = openGreaterRealmPrivateWorkspace(paths);
    const batch = 'batches/review-partial-envelope';
    const destination = join(workspace.root, batch);
    mkdirSync(destination, { recursive: true, mode: 0o700 });
    chmodSync(destination, 0o700);
    writeFileSync(
      join(destination, '.wk-publish-envelope-v1'),
      'warpkeep-greater-realm-private-directory-envelope-v1\n',
      { mode: 0o600 },
    );
    mkdirSync(join(
      destination,
      '.wk-publish-payload-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ), { mode: 0o700 });

    expect(() => workspace.hasFile(`${batch}/candidate.bin`))
      .toThrow('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
    expect(() => workspace.attestTree(batch))
      .toThrow('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
  });

  it('rejects a staged symbolic link without following its external target', async () => {
    const paths = isolatedPaths();
    const workspace = openGreaterRealmPrivateWorkspace(paths);
    const batch = 'batches/review-linked';
    const external = join(paths.root, 'external-private-fixture');
    writeFileSync(external, 'must remain unchanged', { mode: 0o600 });

    await expect(workspace.withAtomicDirectoryPublish(batch, async staged => {
      symlinkSync(external, join(staged.root, 'replacement'));
    })).rejects.toThrow('GREATER_REALM_PRIVATE_PATH_SYMLINK');

    expect(readFileSync(external, 'utf8')).toBe('must remain unchanged');
    expect(existsSync(join(workspace.root, batch))).toBe(false);
    expect(readdirSync(join(workspace.root, '.pending'))).toEqual([]);
  });

  it('rejects repository overlap and every symbolic-link workspace boundary', () => {
    const paths = isolatedPaths();
    expect(() => openGreaterRealmPrivateWorkspace({
      repositoryRoot: paths.repositoryRoot,
      workspaceRoot: join(paths.repositoryRoot, '.ignored-private'),
    })).toThrow('GREATER_REALM_PRIVATE_ROOT_REPOSITORY_OVERLAP');

    const real = join(paths.root, 'real-private');
    const linked = join(paths.root, 'linked-private');
    mkdirSync(real, { mode: 0o700 });
    symlinkSync(real, linked, 'dir');
    expect(() => openGreaterRealmPrivateWorkspace({
      repositoryRoot: paths.repositoryRoot,
      workspaceRoot: linked,
    })).toThrow('GREATER_REALM_PRIVATE_PATH_SYMLINK');
  });

  it('rejects permissive or replaced entries during a complete tree attestation', () => {
    const paths = isolatedPaths();
    const workspace = openGreaterRealmPrivateWorkspace(paths);
    workspace.ensureDirectory('candidate');
    const external = join(paths.root, 'external');
    writeFileSync(external, 'controlled fixture', { mode: 0o600 });
    symlinkSync(external, join(workspace.root, 'candidate', 'replacement'));

    expect(() => workspace.attestTree()).toThrow('GREATER_REALM_PRIVATE_PATH_SYMLINK');

    rmSync(join(workspace.root, 'candidate', 'replacement'));
    writeFileSync(join(workspace.root, 'candidate', 'permissive'), 'fixture', { mode: 0o644 });
    expect(() => workspace.attestTree()).toThrow('GREATER_REALM_PRIVATE_FILE_INVALID');
  });

  it('fails closed on existing directory permission drift without repairing it', () => {
    const paths = isolatedPaths();
    const workspace = openGreaterRealmPrivateWorkspace(paths);
    workspace.ensureDirectory('candidate');
    const candidateDirectory = join(workspace.root, 'candidate');
    chmodSync(candidateDirectory, 0o755);

    expect(() => workspace.ensureDirectory('candidate/previews'))
      .toThrow('GREATER_REALM_PRIVATE_DIRECTORY_PERMISSIONS');
    expect(statSync(candidateDirectory).mode & 0o777).toBe(0o755);

    chmodSync(candidateDirectory, 0o700);
    chmodSync(workspace.root, 0o750);
    expect(() => workspace.hasFile('missing.bin'))
      .toThrow('GREATER_REALM_PRIVATE_DIRECTORY_PERMISSIONS');
    expect(statSync(workspace.root).mode & 0o777).toBe(0o750);
  });

  it('rejects a workspace root replaced after its identity was pinned', () => {
    const paths = isolatedPaths();
    const workspace = openGreaterRealmPrivateWorkspace(paths);
    const displaced = `${workspace.root}.displaced`;
    renameSync(workspace.root, displaced);
    mkdirSync(workspace.root, { mode: 0o700 });

    expect(() => workspace.ensureDirectory('candidate'))
      .toThrow('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
  });

  it('refuses to create a private root through an untrusted writable ancestor', () => {
    const paths = isolatedPaths();
    const untrusted = join(paths.root, 'untrusted');
    mkdirSync(untrusted, { mode: 0o700 });
    chmodSync(untrusted, 0o777);

    expect(() => openGreaterRealmPrivateWorkspace({
      repositoryRoot: paths.repositoryRoot,
      workspaceRoot: join(untrusted, 'private-workspace'),
    })).toThrow('GREATER_REALM_PRIVATE_PATH_UNTRUSTED_ANCESTOR');
    expect(statSync(untrusted).mode & 0o777).toBe(0o777);
  });

  it('rejects hard-linked regular files from every private read path', () => {
    const paths = isolatedPaths();
    const workspace = openGreaterRealmPrivateWorkspace(paths);
    workspace.ensureDirectory('candidate');
    workspace.writeFileAtomic('candidate/atlas.bin', Uint8Array.from([1, 2, 3, 4]));
    linkSync(
      join(workspace.root, 'candidate', 'atlas.bin'),
      join(workspace.root, 'candidate', 'atlas-copy.bin'),
    );

    expect(() => workspace.hasFile('candidate/atlas.bin'))
      .toThrow('GREATER_REALM_PRIVATE_FILE_INVALID');
    expect(() => workspace.readFile('candidate/atlas.bin'))
      .toThrow('GREATER_REALM_PRIVATE_FILE_INVALID');
    expect(() => workspace.attestTree('candidate'))
      .toThrow('GREATER_REALM_PRIVATE_FILE_INVALID');
  });

  it('never accepts generation secrets from process arguments or environment', () => {
    const generatedSecret = Buffer.from(
      Uint8Array.from({ length: 32 }, (_, index) => (index * 29 + 7) & 0xff),
    ).toString('hex');
    const generatedBase64UrlSecret = Buffer.alloc(32, 0xff).toString('base64url');

    expect(() => assertGreaterRealmPrivateInvocation(
      [`--seed=${generatedSecret}`],
      {},
    )).toThrow('GREATER_REALM_PRIVATE_INVOCATION_REJECTED');
    expect(() => assertGreaterRealmPrivateInvocation(
      ['generate-candidates'],
      { WARPKEEP_GREATER_REALM_SEED: generatedSecret },
    )).toThrow('GREATER_REALM_PRIVATE_INVOCATION_REJECTED');
    expect(() => assertGreaterRealmPrivateInvocation(
      ['generate-candidates'],
      { GENERIC_SECRET: generatedSecret },
    )).toThrow('GREATER_REALM_PRIVATE_INVOCATION_REJECTED');
    expect(() => assertGreaterRealmPrivateInvocation(
      ['generate-candidates'],
      { warpkeep_greater_realm_seed: 'case-folded-reserved-channel' },
    )).toThrow('GREATER_REALM_PRIVATE_INVOCATION_REJECTED');
    expect(() => assertGreaterRealmPrivateInvocation(
      ['generate-candidates'],
      { GENERIC_UPPERCASE_SECRET: generatedSecret.toUpperCase() },
    )).toThrow('GREATER_REALM_PRIVATE_INVOCATION_REJECTED');
    expect(() => assertGreaterRealmPrivateInvocation(
      ['generate-candidates'],
      { GENERIC_VALUE: generatedSecret.toUpperCase() },
    )).toThrow('GREATER_REALM_PRIVATE_INVOCATION_REJECTED');
    expect(() => assertGreaterRealmPrivateInvocation(
      ['generate-candidates'],
      { GENERIC_BASE64URL_SECRET: generatedBase64UrlSecret },
    )).toThrow('GREATER_REALM_PRIVATE_INVOCATION_REJECTED');
    expect(() => assertGreaterRealmPrivateInvocation(
      ['generate-candidates'],
      { GENERIC_VALUE: generatedBase64UrlSecret },
    )).toThrow('GREATER_REALM_PRIVATE_INVOCATION_REJECTED');
    expect(() => assertGreaterRealmPrivateInvocation(
      ['generate-candidates'],
      { PUBLIC_ATLAS_SHA256: generatedSecret.toUpperCase() },
    )).toThrow('GREATER_REALM_PRIVATE_INVOCATION_REJECTED');
    expect(() => assertGreaterRealmPrivateInvocation(
      ['generate-candidates'],
      { NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S: generatedSecret.toUpperCase() },
    )).not.toThrow();
    expect(() => assertGreaterRealmPrivateInvocation(
      ['generate-candidates', '--candidate-count', '12'],
      { HOME: '/controlled/home' },
    )).not.toThrow();
  });

  it('allows only npm\'s exact canonical public-root metadata through the private scanner', () => {
    const canonicalRepositoryRoot = secretShapedCanonicalDirectory();
    const differentCanonicalPath = secretShapedCanonicalDirectory();
    expect(canonicalRepositoryRoot).toMatch(/^[A-Za-z0-9+/_-]{43}$/u);
    expect(differentCanonicalPath).toMatch(/^[A-Za-z0-9+/_-]{43}$/u);

    expect(() => greaterRealmPrivateWorkspaceTestSeams.assertInvocation(
      ['generate-candidates'],
      {
        PWD: canonicalRepositoryRoot,
        INIT_CWD: canonicalRepositoryRoot,
        npm_config_local_prefix: canonicalRepositoryRoot,
      },
      canonicalRepositoryRoot,
    )).not.toThrow();
    expect(() => greaterRealmPrivateWorkspaceTestSeams.assertInvocation(
      ['generate-candidates'],
      { GENERIC_PATH: canonicalRepositoryRoot },
      canonicalRepositoryRoot,
    )).toThrow('GREATER_REALM_PRIVATE_INVOCATION_REJECTED');
    expect(() => greaterRealmPrivateWorkspaceTestSeams.assertInvocation(
      ['generate-candidates'],
      { PWD: differentCanonicalPath },
      canonicalRepositoryRoot,
    )).toThrow('GREATER_REALM_PRIVATE_INVOCATION_REJECTED');
    expect(() => greaterRealmPrivateWorkspaceTestSeams.assertInvocation(
      ['generate-candidates', canonicalRepositoryRoot],
      {},
      canonicalRepositoryRoot,
    )).toThrow('GREATER_REALM_PRIVATE_INVOCATION_REJECTED');
  });

  it.each([
    ['drive-relative component', win32Path.join('candidate', 'C:seed.bin')],
    ['NTFS alternate stream', win32Path.join('candidate', 'atlas.bin:seed')],
    ['reserved DOS device', win32Path.join('candidate', 'NUL.txt')],
    ['reserved extended DOS device', win32Path.join('candidate', 'COM\u00b9.log')],
    ['trailing dot alias', win32Path.join('candidate', 'seed.bin.')],
    ['trailing space alias', win32Path.join('candidate', 'seed.bin ')],
    ['control character', win32Path.join('candidate', 'seed\u0001.bin')],
    ['Win32 wildcard', win32Path.join('candidate', 'seed?.bin')],
  ])('rejects a non-portable Windows %s before touching the filesystem', (
    _label,
    relativePath,
  ) => {
    const paths = isolatedPaths();
    const workspace = openGreaterRealmPrivateWorkspace(paths);
    expect(() => workspace.ensureDirectory(relativePath))
      .toThrow('GREATER_REALM_PRIVATE_RELATIVE_PATH_INVALID');
    expect(readdirSync(workspace.root)).toEqual([]);
  });

  it('serializes operations with an inode-safe exclusive lock', async () => {
    const paths = isolatedPaths();
    const workspace = openGreaterRealmPrivateWorkspace(paths);
    let entered = false;

    await workspace.withExclusiveLock('locks/generate.lock', async () => {
      entered = true;
      await expect(workspace.withExclusiveLock('locks/generate.lock', async () => true))
        .rejects.toThrow('GREATER_REALM_PRIVATE_ALREADY_RUNNING');
    });

    expect(entered).toBe(true);
    await expect(workspace.withExclusiveLock('locks/generate.lock', async () => 'released'))
      .resolves.toBe('released');
  });

  it('fails a locked operation if the lock inode is hard-linked', async () => {
    const paths = isolatedPaths();
    const workspace = openGreaterRealmPrivateWorkspace(paths);

    await expect(workspace.withExclusiveLock('locks/generate.lock', async () => {
      linkSync(
        join(workspace.root, 'locks', 'generate.lock'),
        join(workspace.root, 'locks', 'copied.lock'),
      );
      return 'must-not-resolve';
    })).rejects.toThrow('GREATER_REALM_PRIVATE_FILE_CHANGED');
    expect(workspace.hasFile('locks/generate.lock')).toBe(false);
  });
});

describe('Greater Realm public and release boundary', () => {
  it('scans the newly built release after Vite emits production output', () => {
    const packageJson = JSON.parse(readFileSync(
      join(process.cwd(), 'package.json'),
      'utf8',
    )) as { scripts?: { build?: unknown } };
    const build = packageJson.scripts?.build;
    expect(typeof build).toBe('string');
    const viteIndex = (build as string).indexOf('vite build');
    const boundaryIndex = (build as string)
      .indexOf('node scripts/atlas/verify-public-boundary.mjs');
    expect(viteIndex).toBeGreaterThanOrEqual(0);
    expect(boundaryIndex).toBeGreaterThan(viteIndex);
  });

  it('accepts an ordinary tracked and deployable tree', () => {
    const paths = scannerRepository();
    expect(verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: ['public/ordinary.txt'],
    })).toMatchObject({ trackedPathCount: 1 });
  });

  it('accepts only an exact sanitized review document in the Greater Realm evidence directory', () => {
    const paths = scannerRepository();
    const relativePath = 'docs/evidence/greater-realm/candidate-review-v1.json';
    mkdirSync(join(paths.repositoryRoot, 'docs', 'evidence', 'greater-realm'), {
      recursive: true,
    });
    writeFileSync(join(paths.repositoryRoot, relativePath), sanitizedReviewEvidence());

    expect(verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [relativePath],
    })).toMatchObject({ trackedPathCount: 1 });
  });

  it('accepts the exact verified one-world pending owner report', () => {
    const paths = scannerRepository();
    const relativePath = 'docs/evidence/greater-realm/pending-owner-review-v1.json';
    mkdirSync(dirname(join(paths.repositoryRoot, relativePath)), { recursive: true });
    writeFileSync(join(paths.repositoryRoot, relativePath), pendingOwnerReviewEvidence());

    expect(verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [relativePath],
    })).toMatchObject({ trackedPathCount: 1 });
  });

  it('rejects a pending owner report whose source aggregate digest was not rebound', () => {
    const paths = scannerRepository();
    const relativePath = 'docs/evidence/greater-realm/pending-owner-review-v1.json';
    mkdirSync(dirname(join(paths.repositoryRoot, relativePath)), { recursive: true });
    const report = JSON.parse(pendingOwnerReviewEvidence()) as {
      candidate: { quality: { naturalnessBasisPoints: number } };
    };
    report.candidate.quality.naturalnessBasisPoints -= 1;
    writeFileSync(
      join(paths.repositoryRoot, relativePath),
      `${JSON.stringify(report, null, 2)}\n`,
    );

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_SANITIZED_REVIEW_INVALID');
  });

  it('rejects private material added to a pending owner report', () => {
    const paths = scannerRepository();
    const relativePath = 'docs/evidence/greater-realm/pending-owner-review-v1.json';
    mkdirSync(dirname(join(paths.repositoryRoot, relativePath)), { recursive: true });
    const report = JSON.parse(pendingOwnerReviewEvidence()) as {
      candidate: Record<string, unknown>;
    };
    report.candidate.firstQ = 42;
    writeFileSync(
      join(paths.repositoryRoot, relativePath),
      `${JSON.stringify(report, null, 2)}\n`,
    );

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_SANITIZED_REVIEW_INVALID');
  });

  it('rejects activated or owner-selected state in the pending owner report', () => {
    const paths = scannerRepository();
    const relativePath = 'docs/evidence/greater-realm/pending-owner-review-v1.json';
    mkdirSync(dirname(join(paths.repositoryRoot, relativePath)), { recursive: true });
    const report = JSON.parse(pendingOwnerReviewEvidence()) as {
      activationStatus: string;
    };
    report.activationStatus = 'active';
    writeFileSync(
      join(paths.repositoryRoot, relativePath),
      `${JSON.stringify(report, null, 2)}\n`,
    );

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_SANITIZED_REVIEW_INVALID');
  });

  it('does not accept the pending owner schema under an unreviewed basename', () => {
    const paths = scannerRepository();
    const relativePath = 'docs/evidence/greater-realm/pending-owner-renamed-v1.json';
    mkdirSync(dirname(join(paths.repositoryRoot, relativePath)), { recursive: true });
    writeFileSync(join(paths.repositoryRoot, relativePath), pendingOwnerReviewEvidence());

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_SANITIZED_REVIEW_INVALID');
  });

  it('accepts only the immutable canonical Greater Realm evidence README bytes', () => {
    const paths = scannerRepository();
    const relativePath = 'docs/evidence/greater-realm/README.md';
    const evidenceDirectory = join(paths.repositoryRoot, 'docs', 'evidence', 'greater-realm');
    mkdirSync(evidenceDirectory, { recursive: true });
    writeFileSync(
      join(paths.repositoryRoot, relativePath),
      readFileSync(join(import.meta.dirname, '..', relativePath)),
    );

    expect(verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [relativePath],
    })).toMatchObject({ trackedPathCount: 1 });
  });

  it.each([
    ['coordinate', '\nUnreviewed coordinate: q=42, r=-7.\n'],
    ['seed', '\nUnreviewed seed material belongs here.\n'],
    ['path', '\nUnreviewed path: /private/owner/review.json\n'],
  ])('rejects appended %s-like data in the canonical evidence README', (_label, suffix) => {
    const paths = scannerRepository();
    const relativePath = 'docs/evidence/greater-realm/README.md';
    const evidenceDirectory = join(paths.repositoryRoot, 'docs', 'evidence', 'greater-realm');
    mkdirSync(evidenceDirectory, { recursive: true });
    const canonical = readFileSync(join(import.meta.dirname, '..', relativePath));
    writeFileSync(
      join(paths.repositoryRoot, relativePath),
      Buffer.concat([canonical, Buffer.from(suffix, 'utf8')]),
    );

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_SANITIZED_REVIEW_INVALID');
  });

  it.each([
    'docs/evidence/greater-realm/leak.txt',
    'docs/evidence/greater-realm/leak.JSON',
    'docs/evidence/greater-realm/nested/leak.json',
  ])('fails closed on noncanonical Greater Realm evidence path %s', (relativePath) => {
    const paths = scannerRepository();
    mkdirSync(dirname(join(paths.repositoryRoot, relativePath)), { recursive: true });
    writeFileSync(join(paths.repositoryRoot, relativePath), '{"firstQ":42,"firstR":-7}\n');

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_SANITIZED_REVIEW_INVALID');
  });

  it('rejects duplicate-key shadow payloads even when JSON.parse keeps a valid final value', () => {
    const paths = scannerRepository();
    const relativePath = 'docs/evidence/greater-realm/candidate-review-v1.json';
    mkdirSync(join(paths.repositoryRoot, 'docs', 'evidence', 'greater-realm'), {
      recursive: true,
    });
    const shadowed = sanitizedReviewEvidence().replace(
      '    "activeCellCount": 120000,',
      '    "activeCellCount": 42,\n    "activeCellCount": 120000,',
    );
    expect(shadowed).not.toBe(sanitizedReviewEvidence());
    writeFileSync(join(paths.repositoryRoot, relativePath), shadowed);

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_SANITIZED_REVIEW_INVALID');
  });

  it.each(['firstQ', 'firstR'])(
    'rejects the unreviewed camel-case coordinate field %s from public evidence',
    (coordinateKey) => {
      const paths = scannerRepository();
      const relativePath = 'docs/evidence/greater-realm/candidate-review-v1.json';
      mkdirSync(join(paths.repositoryRoot, 'docs', 'evidence', 'greater-realm'), {
        recursive: true,
      });
      const review = JSON.parse(sanitizedReviewEvidence()) as {
        candidates: Array<Record<string, unknown>>;
      };
      review.candidates[0]![coordinateKey] = 42;
      writeFileSync(join(paths.repositoryRoot, relativePath), `${JSON.stringify(review)}\n`);

      expect(() => verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        trackedPaths: [relativePath],
      })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_SANITIZED_REVIEW_INVALID');
    },
  );

  it('rejects aggregate-looking fields that are outside the exact review schema', () => {
    const paths = scannerRepository();
    const relativePath = 'docs/evidence/greater-realm/candidate-review-v1.json';
    mkdirSync(join(paths.repositoryRoot, 'docs', 'evidence', 'greater-realm'), {
      recursive: true,
    });
    const review = JSON.parse(sanitizedReviewEvidence()) as {
      candidates: Array<{ quality: Record<string, unknown> }>;
    };
    review.candidates[0]!.quality.terrainVarianceBasisPoints = 500;
    writeFileSync(join(paths.repositoryRoot, relativePath), `${JSON.stringify(review)}\n`);

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_SANITIZED_REVIEW_INVALID');
  });

  it('schema-validates staged Greater Realm evidence blobs independently of the worktree', () => {
    const paths = scannerRepository();
    const relativePath = 'docs/evidence/greater-realm/candidate-review-v1.json';
    const absolutePath = join(paths.repositoryRoot, relativePath);
    mkdirSync(join(paths.repositoryRoot, 'docs', 'evidence', 'greater-realm'), {
      recursive: true,
    });
    runFixtureGit(paths.repositoryRoot, ['init', '--quiet']);
    const stagedReview = JSON.parse(sanitizedReviewEvidence()) as {
      candidates: Array<Record<string, unknown>>;
    };
    stagedReview.candidates[0]!.firstQ = 7;
    writeFileSync(absolutePath, `${JSON.stringify(stagedReview)}\n`);
    runFixtureGit(paths.repositoryRoot, ['add', '--', relativePath]);
    writeFileSync(absolutePath, sanitizedReviewEvidence());

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_SANITIZED_REVIEW_INVALID');
  });

  it('scans exact staged blob bytes when safer worktree bytes differ', () => {
    const paths = scannerRepository();
    runFixtureGit(paths.repositoryRoot, ['init', '--quiet']);
    const trackedFile = join(paths.repositoryRoot, 'public', 'ordinary.txt');
    writeFileSync(trackedFile, ['WKGR-PRIVATE-', 'PACKAGE-V1'].join(''));
    runFixtureGit(paths.repositoryRoot, ['add', '--', 'public/ordinary.txt']);
    writeFileSync(trackedFile, 'ordinary unstaged replacement\n');

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
  });

  it.each([
    ['UTF-32LE', false, Buffer.from([0xff, 0xfe, 0, 0])],
    ['UTF-32BE', true, Buffer.from([0, 0, 0xfe, 0xff])],
  ] as const)('rejects a renamed private marker encoded as %s', (
    _label,
    bigEndian,
    bom,
  ) => {
    const paths = scannerRepository();
    const relativePath = 'public/ordinary-looking-utf32.bin';
    const marker = ['WKGR-PRIVATE-', 'ATLAS-V1'].join('');
    const body = Buffer.allocUnsafe([...marker].length * 4);
    [...marker].forEach((character, index) => {
      const value = character.codePointAt(0)!;
      if (bigEndian) body.writeUInt32BE(value, index * 4);
      else body.writeUInt32LE(value, index * 4);
    });
    const bytes = Buffer.concat([bom, body]);
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
    } finally {
      body.fill(0);
      bytes.fill(0);
    }

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
  });

  it('rejects a missing worktree file even when its private blob remains staged', () => {
    const paths = scannerRepository();
    runFixtureGit(paths.repositoryRoot, ['init', '--quiet']);
    const trackedFile = join(paths.repositoryRoot, 'public', 'ordinary.txt');
    writeFileSync(trackedFile, ['WKGR-PRIVATE-', 'PACKAGE-V1'].join(''));
    runFixtureGit(paths.repositoryRoot, ['add', '--', 'public/ordinary.txt']);
    rmSync(trackedFile);

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_SPECIAL_ENTRY');
  });

  it('ignores hostile PATH, Git environment, and helper-bearing configuration', () => {
    const paths = scannerRepository();
    runFixtureGit(paths.repositoryRoot, ['init', '--quiet']);
    mkdirSync(join(paths.repositoryRoot, 'review'));
    writeFileSync(join(paths.repositoryRoot, 'review', 'seed.bin'), 'tracked fixture\n');
    runFixtureGit(paths.repositoryRoot, ['add', '--', 'public/ordinary.txt', 'review/seed.bin']);

    const hostileBin = join(paths.root, 'hostile-bin');
    const fakeGitMarker = join(paths.root, 'fake-git-ran');
    writeProbeExecutable(hostileBin, 'git', fakeGitMarker);
    const helperMarker = join(paths.root, 'git-helper-ran');
    const helper = writeProbeExecutable(paths.root, 'hostile-git-helper', helperMarker);
    const hookMarker = join(paths.root, 'git-hook-ran');
    const hooksDirectory = join(paths.root, 'hostile-hooks');
    writeProbeExecutable(hooksDirectory, 'post-index-change', hookMarker);
    const decoyWorktree = join(paths.root, 'decoy-worktree');
    mkdirSync(decoyWorktree);

    runFixtureGit(paths.repositoryRoot, ['config', '--local', 'core.fsmonitor', helper]);
    runFixtureGit(paths.repositoryRoot, ['config', '--local', 'core.hooksPath', hooksDirectory]);
    runFixtureGit(paths.repositoryRoot, ['config', '--local', 'core.worktree', decoyWorktree]);
    runFixtureGit(paths.repositoryRoot, ['config', '--local', 'core.bare', 'true']);

    const hostileConfig = join(paths.root, 'hostile.gitconfig');
    runFixtureGit(paths.repositoryRoot, [
      'config', '--file', hostileConfig, 'core.fsmonitor', helper,
    ]);
    runFixtureGit(paths.repositoryRoot, [
      'config', '--file', hostileConfig, 'core.hooksPath', hooksDirectory,
    ]);
    runFixtureGit(paths.repositoryRoot, [
      'config', '--file', hostileConfig, 'alias.ls-files', `!${helper}`,
    ]);

    const hostileEnvironment: Record<string, string> = {
      GIT_ALTERNATE_OBJECT_DIRECTORIES: join(paths.root, 'hostile-objects'),
      GIT_ASKPASS: helper,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_GLOBAL: hostileConfig,
      GIT_CONFIG_KEY_0: 'core.fsmonitor',
      GIT_CONFIG_SYSTEM: hostileConfig,
      GIT_CONFIG_VALUE_0: helper,
      GIT_DIR: join(paths.root, 'missing-git-directory'),
      GIT_EXEC_PATH: hostileBin,
      GIT_EXTERNAL_DIFF: helper,
      GIT_INDEX_FILE: join(paths.root, 'missing-index'),
      GIT_OBJECT_DIRECTORY: join(paths.root, 'hostile-objects'),
      GIT_PAGER: helper,
      GIT_WORK_TREE: decoyWorktree,
      HOME: paths.root,
      PATH: hostileBin,
      XDG_CONFIG_HOME: paths.root,
    };
    const originalEnvironment = new Map(
      Object.keys(hostileEnvironment).map(key => [key, process.env[key]]),
    );
    try {
      Object.assign(process.env, hostileEnvironment);
      expect(() => verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        scanRoots: [],
      })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_PATH');
    } finally {
      for (const [key, value] of originalEnvironment) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    expect(existsSync(fakeGitMarker)).toBe(false);
    expect(existsSync(helperMarker)).toBe(false);
    expect(existsSync(hookMarker)).toBe(false);
  });

  it.each([
    '.warpkeep-private/candidate/manifest.json',
    'review/seed.bin',
    'review/batch-seed.bin',
    'review/manifest.private.json',
    'review/batch.private.json',
    'review/selection.private.json',
    'review/shortlist.private.json',
    'review/private-preview-hillshade.png',
    'review/candidate.wkgr-private',
    'review/candidate.wkgr-checkpoint',
    'review/candidate.wkgr-atlas',
    'docs/evidence/greater-realm/private-preview.png',
  ])('rejects a tracked private generation coordinate: %s', (trackedPath) => {
    const paths = scannerRepository();
    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [trackedPath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_PATH');
  });

  it('rejects private package markers and fields from source or release output', () => {
    const paths = scannerRepository();
    writeFileSync(
      join(paths.repositoryRoot, 'dist', 'candidate.js'),
      ['WKGR-PRIVATE-', 'PACKAGE-V1'].join(''),
    );
    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');

    rmSync(join(paths.repositoryRoot, 'dist', 'candidate.js'));
    writeFileSync(
      join(paths.repositoryRoot, 'src', 'leak.ts'),
      `export const leaked = { ${['seed', 'Material'].join('')}: 'not-a-real-secret' };`,
    );
    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it.each([
    [
      'renamed checkpoint owner key',
      ['WKGR-PRIVATE-', 'CHECKPOINT-OWNER-KEY-V1'].join(''),
      'utf8',
    ],
    [
      'renamed encrypted attempt checkpoint',
      ['WKGR-PRIVATE-', 'ATTEMPT-CHECKPOINT-V1'].join(''),
      'utf16le',
    ],
    [
      'renamed attempt completion kind',
      ['warpkeep.greater-realm.private-', 'attempt-completion.v1'].join(''),
      'utf8',
    ],
  ] as const)('rejects a %s marker', (_label, marker, encoding) => {
    const paths = scannerRepository();
    const relativePath = 'public/ordinary-state.bin';
    const bytes = Buffer.from(marker, encoding);
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
      expect(() => verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        trackedPaths: [relativePath],
      })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
    } finally {
      bytes.fill(0);
    }
  });

  it('scans complete binary artifacts instead of trusting an ordinary prefix', () => {
    const paths = scannerRepository();
    const bytes = Buffer.alloc(96 * 1_024, 0x41);
    Buffer.from(['WKGR-PRIVATE-', 'ATLAS-V1'].join(''), 'utf8').copy(bytes, 80 * 1_024);
    writeFileSync(join(paths.repositoryRoot, 'public', 'ordinary-looking.bin'), bytes);

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
  });

  it.each([
    ['UTF-16LE', 'utf16le', Buffer.from([0xff, 0xfe])],
    ['UTF-16BE', 'utf16le', Buffer.from([0xfe, 0xff])],
  ] as const)('rejects a renamed private marker encoded as %s', (
    _label,
    encoding,
    bom,
  ) => {
    const paths = scannerRepository();
    const relativePath = 'public/ordinary-looking.bin';
    const body = Buffer.from(['WKGR-PRIVATE-', 'ATLAS-V1'].join(''), encoding);
    if (bom[0] === 0xfe) body.swap16();
    const bytes = Buffer.concat([bom, body]);
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
    } finally {
      body.fill(0);
      bytes.fill(0);
    }

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
  });

  it.each([
    ['UTF-16LE with BOM', false, true],
    ['UTF-16BE with BOM', true, true],
    ['BOM-less UTF-16LE', false, false],
    ['BOM-less UTF-16BE', true, false],
  ] as const)('rejects markerless private JSON encoded as %s', (
    _label,
    bigEndian,
    includeBom,
  ) => {
    const paths = scannerRepository();
    const relativePath = 'public/ordinary-authority.bin';
    const body = Buffer.from('{"ecologyClass":1}\n', 'utf16le');
    if (bigEndian) body.swap16();
    const prefix = includeBom
      ? Buffer.from(bigEndian ? [0xfe, 0xff] : [0xff, 0xfe])
      : Buffer.alloc(0);
    const bytes = Buffer.concat([prefix, body]);
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
    } finally {
      prefix.fill(0);
      body.fill(0);
      bytes.fill(0);
    }

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it.each([
    ['UTF-32LE with BOM', false, Buffer.from([0xff, 0xfe, 0, 0])],
    ['UTF-32BE with BOM', true, Buffer.from([0, 0, 0xfe, 0xff])],
  ] as const)('rejects markerless private JSON encoded as %s', (
    _label,
    bigEndian,
    bom,
  ) => {
    const paths = scannerRepository();
    const relativePath = 'public/ordinary-authority-utf32.bin';
    const payload = '{"ecologyClass":"AgAEBg=="}\n';
    const body = Buffer.allocUnsafe([...payload].length * 4);
    [...payload].forEach((character, index) => {
      const value = character.codePointAt(0)!;
      if (bigEndian) body.writeUInt32BE(value, index * 4);
      else body.writeUInt32LE(value, index * 4);
    });
    const bytes = Buffer.concat([bom, body]);
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
    } finally {
      body.fill(0);
      bytes.fill(0);
    }

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it.each([
    [
      'raw ASCII private marker',
      ['WKGR-PRIVATE-', 'ATLAS-V1'].join(''),
      'GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER',
    ],
    [
      'raw ASCII authority inventory',
      [
        'dressing-excluded',
        'ecology-class',
        'vegetation-density',
        'route-class',
        'landmark-class',
        'ambient-life-class',
      ].join('\n'),
      'GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD',
    ],
  ])('binary-scans a UTF-16-decoding polyglot containing %s', (
    _label,
    payload,
    expectedError,
  ) => {
    const paths = scannerRepository();
    const relativePath = 'public/encoded-polyglot.bin';
    const body = Buffer.from(payload, 'ascii');
    const padding = Buffer.alloc(body.length % 2, 0x20);
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), body, padding]);
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
    } finally {
      body.fill(0);
      padding.fill(0);
      bytes.fill(0);
    }

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow(expectedError);
  });

  it.each(['UTF-16LE', 'UTF-32LE'] as const)(
    'retains %s classification when encoded private JSON has trailing junk',
    encoding => {
      const paths = scannerRepository();
      const relativePath = 'public/encoded-trailing-junk.bin';
      const payload = '{"EcOlOgYcLaSs":1}';
      const body = encoding === 'UTF-16LE'
        ? Buffer.from(payload, 'utf16le')
        : (() => {
          const output = Buffer.allocUnsafe([...payload].length * 4);
          [...payload].forEach((character, index) => {
            output.writeUInt32LE(character.codePointAt(0)!, index * 4);
          });
          return output;
        })();
      const bom = Buffer.from(encoding === 'UTF-16LE'
        ? [0xff, 0xfe]
        : [0xff, 0xfe, 0, 0]);
      const bytes = Buffer.concat([bom, body, Buffer.from([0x80])]);
      try {
        writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
      } finally {
        bom.fill(0);
        body.fill(0);
        bytes.fill(0);
      }

      expect(() => verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        scanRoots: [],
        trackedPaths: [relativePath],
      })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
    },
  );

  it.each([
    ['UTF-16LE', 2, false],
    ['UTF-16BE', 2, true],
    ['UTF-32LE', 4, false],
    ['UTF-32BE', 4, true],
  ] as const)('rejects BOM-less %s private text fields after non-ASCII padding', (
    _label,
    width,
    bigEndian,
  ) => {
    const paths = scannerRepository();
    const relativePath = 'public/bomless-private-text-field.bin';
    const payload = `${'\u4241'.repeat(2_048)}{"PrIvAtEsEeDhEx":"${'a'.repeat(64)}"}`;
    const bytes = width === 2
      ? Buffer.from(payload, 'utf16le')
      : (() => {
        const output = Buffer.allocUnsafe([...payload].length * 4);
        [...payload].forEach((character, index) => {
          output.writeUInt32LE(character.codePointAt(0)!, index * 4);
        });
        return output;
      })();
    if (bigEndian) {
      if (width === 2) bytes.swap16();
      else bytes.swap32();
    }
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
    } finally {
      bytes.fill(0);
    }

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('retains an encoded private marker split across streamed binary chunks', () => {
    const paths = scannerRepository();
    const relativePath = 'public/streamed-utf16-marker.bin';
    const bytes = Buffer.alloc(16 * 1_024 * 1_024 + 2 * 64 * 1_024, 0x80);
    const marker = Buffer.from(['WKGR-PRIVATE-', 'CHECKPOINT-V1'].join(''), 'utf16le');
    marker.copy(bytes, 64 * 1_024 - 7);
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
    } finally {
      marker.fill(0);
      bytes.fill(0);
    }

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
  });

  it('case-folds UTF-16 authority split across streamed binary chunks', () => {
    const paths = scannerRepository();
    const relativePath = 'public/streamed-utf16-authority.bin';
    const bytes = Buffer.alloc(16 * 1_024 * 1_024 + 2 * 64 * 1_024, 0x80);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    const authority = Buffer.from('WiLdFlOwErDeNsItY', 'utf16le');
    authority.copy(bytes, 8 * 1_024 * 1_024 + 64 * 1_024 - 9);
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
    } finally {
      authority.fill(0);
      bytes.fill(0);
    }

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it.each([
    ['UTF-8 camel-case groundcover', 'GrOuNdCoVeRdEnSiTy', 1, false],
    ['UTF-16LE kebab-case groundcover', 'GrOuNdCoVeR-DeNsItY', 2, false],
    ['UTF-16BE camel-case wildflower', 'WiLdFlOwErDeNsItY', 2, true],
    ['UTF-32LE kebab-case wildflower', 'WiLdFlOwEr-DeNsItY', 4, false],
    ['UTF-32BE camel-case groundcover', 'GrOuNdCoVeRdEnSiTy', 4, true],
  ] as const)('rejects case-folded %s authority aliases', (
    _label,
    field,
    width,
    bigEndian,
  ) => {
    const paths = scannerRepository();
    const relativePath = 'public/encoded-groundcover-authority.bin';
    const bytes = encodedAuthorityFixture(field, width, bigEndian);
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
    } finally {
      bytes.fill(0);
    }

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('retains alignment for delayed BOM-less UTF-16 stream detection', () => {
    const paths = scannerRepository();
    const relativePath = 'public/streamed-bomless-utf16-authority.bin';
    const bytes = Buffer.alloc(16 * 1_024 * 1_024 + 2 * 64 * 1_024);
    for (let offset = 0; offset < 64 * 1_024; offset += 2) {
      bytes[offset] = 0x41;
      bytes[offset + 1] = 0x42;
    }
    for (let offset = 64 * 1_024; offset < bytes.length; offset += 2) {
      bytes[offset] = 0x20;
    }
    const authority = Buffer.from('{"EcOlOgYcLaSs":1}', 'utf16le');
    authority.copy(bytes, 8 * 1_024 * 1_024 + 64 * 1_024 - 10);
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
    } finally {
      authority.fill(0);
      bytes.fill(0);
    }

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('streams a delayed BOM-less UTF-16 authority from the exact staged blob', () => {
    const paths = scannerRepository();
    const relativePath = 'public/staged-bomless-utf16-authority.bin';
    runFixtureGit(paths.repositoryRoot, ['init', '--quiet']);
    const bytes = Buffer.alloc(16 * 1_024 * 1_024 + 2 * 64 * 1_024);
    for (let offset = 0; offset < 64 * 1_024; offset += 2) {
      bytes[offset] = 0x41;
      bytes[offset + 1] = 0x42;
    }
    for (let offset = 64 * 1_024; offset < bytes.length; offset += 2) {
      bytes[offset] = 0x20;
    }
    const authority = Buffer.from('{"EcOlOgYcLaSs":1}', 'utf16le');
    authority.copy(bytes, 8 * 1_024 * 1_024 + 64 * 1_024 - 10);
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
      runFixtureGit(paths.repositoryRoot, ['add', '--', relativePath]);
    } finally {
      authority.fill(0);
      bytes.fill(0);
    }
    writeFileSync(join(paths.repositoryRoot, relativePath), 'ordinary replacement\n');

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it.each([
    ['worktree', false],
    ['staged', true],
  ] as const)(
    'rejects large initialized UTF-8 authority JSON from the %s surface',
    (_surface, staged) => {
      const paths = scannerRepository();
      const relativePath = staged
        ? 'public/staged-large-authority-json.bin'
        : 'public/large-authority-json.bin';
      if (staged) runFixtureGit(paths.repositoryRoot, ['init', '--quiet']);
      const bytes = Buffer.alloc(16 * 1_024 * 1_024 + 2 * 64 * 1_024, 0x20);
      const payload = Buffer.from('{"GrOuNdCoVeRdEnSiTy":"AgAEBg=="}', 'utf8');
      payload.copy(bytes, 8 * 1_024 * 1_024 + 64 * 1_024 - 7);
      try {
        writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
        if (staged) runFixtureGit(paths.repositoryRoot, ['add', '--', relativePath]);
      } finally {
        payload.fill(0);
        bytes.fill(0);
      }
      if (staged) {
        writeFileSync(join(paths.repositoryRoot, relativePath), 'ordinary replacement\n');
      }

      expect(() => verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        scanRoots: [],
        ...(staged ? {} : { trackedPaths: [relativePath] }),
      })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
    },
  );

  it('rejects a distinctive relief metric alias in a large streamed binary', () => {
    const paths = scannerRepository();
    const relativePath = 'public/large-relief-metric.bin';
    const bytes = Buffer.alloc(16 * 1_024 * 1_024 + 2 * 64 * 1_024, 0x80);
    const metric = Buffer.from('PaIrCoUnTsByLaGaNdAxIs', 'ascii');
    metric.copy(bytes, 8 * 1_024 * 1_024 + 64 * 1_024 - 11);
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
    } finally {
      metric.fill(0);
      bytes.fill(0);
    }

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('allows evidence-only digest vocabulary in an unknown binary surface', () => {
    const paths = scannerRepository();
    const relativePath = 'public/digest-vocabulary.bin';
    writeFileSync(
      join(paths.repositoryRoot, relativePath),
      'layoutDigest stageDigest packageDigest\n',
    );

    expect(verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toMatchObject({ trackedPathCount: 1 });
  });

  it('rejects a markerless non-UTF8 binary carrying the complete authority inventory', () => {
    const paths = scannerRepository();
    const relativePath = 'public/ordinary-authority.bin';
    const fields = [
      'dressing-excluded',
      'ecology-class',
      'vegetation-density',
      'groundcover-density',
      'wildflower-density',
      'route-class',
      'landmark-class',
      'ambient-life-class',
    ];
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0x00, 0x80]),
      ...fields.flatMap(field => [Buffer.from(field, 'ascii'), Buffer.from([0x00, 0x01])]),
    ]);
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
    } finally {
      bytes.fill(0);
    }

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('rejects a markerless UTF-8 binary carrying the complete authority inventory', () => {
    const paths = scannerRepository();
    const relativePath = 'public/ordinary-ascii-authority.bin';
    writeFileSync(join(paths.repositoryRoot, relativePath), [
      'dressing-excluded',
      'ecology-class',
      'vegetation-density',
      'groundcover-density',
      'wildflower-density',
      'route-class',
      'landmark-class',
      'ambient-life-class',
      '',
    ].join('\n'));

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('case-folds ASCII authority across chunks and split field names', () => {
    const paths = scannerRepository();
    const relativePath = 'public/streamed-authority.bin';
    const bytes = Buffer.alloc(16 * 1_024 * 1_024 + 2 * 64 * 1_024, 0x80);
    const fields = [
      ['Dressing-Excluded', 64 * 1_024 - 5],
      ['Ecology-Class', 2 * 1_024 * 1_024 + 11],
      ['Vegetation-Density', 5 * 1_024 * 1_024 + 23],
      ['Groundcover-Density', 6 * 1_024 * 1_024 + 29],
      ['Wildflower-Density', 7 * 1_024 * 1_024 + 31],
      ['Route-Class', 8 * 1_024 * 1_024 + 37],
      ['Landmark-Class', 11 * 1_024 * 1_024 + 41],
      ['Ambient-Life-Class', 15 * 1_024 * 1_024 + 53],
    ] as const;
    for (const [field, offset] of fields) bytes.write(field, offset, 'ascii');
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
    } finally {
      bytes.fill(0);
    }

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('rejects markerless binary authority bytes from the staged blob, not a safer worktree', () => {
    const paths = scannerRepository();
    const relativePath = 'public/staged-authority.bin';
    runFixtureGit(paths.repositoryRoot, ['init', '--quiet']);
    const bytes = Buffer.concat([
      Buffer.from([0xff]),
      Buffer.from([
        'dressing-excluded\0',
        'ecology-class\0',
        'vegetation-density\0',
        'groundcover-density\0',
        'wildflower-density\0',
        'route-class\0',
        'landmark-class\0',
        'ambient-life-class\0',
      ].join(''), 'ascii'),
    ]);
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
      runFixtureGit(paths.repositoryRoot, ['add', '--', relativePath]);
    } finally {
      bytes.fill(0);
    }
    writeFileSync(join(paths.repositoryRoot, relativePath), 'ordinary replacement\n');

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('rejects markerless UTF-8 authority bytes from the staged binary blob', () => {
    const paths = scannerRepository();
    const relativePath = 'public/staged-ascii-authority.bin';
    runFixtureGit(paths.repositoryRoot, ['init', '--quiet']);
    writeFileSync(join(paths.repositoryRoot, relativePath), [
      'dressing-excluded',
      'ecology-class',
      'vegetation-density',
      'groundcover-density',
      'wildflower-density',
      'route-class',
      'landmark-class',
      'ambient-life-class',
      '',
    ].join('\n'));
    runFixtureGit(paths.repositoryRoot, ['add', '--', relativePath]);
    writeFileSync(join(paths.repositoryRoot, relativePath), 'ordinary replacement\n');

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it.each([false, true])(
    'zeroizes its owned loaded buffer after %s scan without mutating source bytes',
    (rejectPrivateMarker) => {
      const paths = scannerRepository();
      const relativePath = 'public/zeroization.bin';
      const source = Buffer.from(
        rejectPrivateMarker
          ? ['WKGR-PRIVATE-', 'PACKAGE-V1'].join('')
          : 'ordinary binary fixture',
        'utf8',
      );
      const expectedSource = Buffer.from(source);
      writeFileSync(join(paths.repositoryRoot, relativePath), source);
      const captured: Buffer[] = [];
      const originalAlloc = Buffer.alloc;
      const allocationSpy = vi.spyOn(Buffer, 'alloc').mockImplementation((function (
        size: number,
        ...rest: unknown[]
      ) {
        const buffer = Reflect.apply(originalAlloc, Buffer, [size, ...rest]) as Buffer;
        if (size === source.length) captured.push(buffer);
        return buffer;
      }) as typeof Buffer.alloc);
      try {
        if (rejectPrivateMarker) {
          expect(() => verifyGreaterRealmPublicBoundary({
            repositoryRoot: paths.repositoryRoot,
            scanRoots: [],
            trackedPaths: [relativePath],
          })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
        } else {
          expect(verifyGreaterRealmPublicBoundary({
            repositoryRoot: paths.repositoryRoot,
            scanRoots: [],
            trackedPaths: [relativePath],
          })).toMatchObject({ trackedPathCount: 1 });
        }
      } finally {
        allocationSpy.mockRestore();
      }

      expect(captured).toHaveLength(1);
      expect(captured[0]!.every(value => value === 0)).toBe(true);
      expect(source).toEqual(expectedSource);
      source.fill(0);
      expectedSource.fill(0);
    },
  );

  it('bounds public binary scanning work', () => {
    const paths = scannerRepository();
    const oversized = join(paths.repositoryRoot, 'public', 'oversized.bin');
    writeFileSync(oversized, '');
    truncateSync(oversized, 128 * 1_024 * 1_024 + 1);

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_BINARY_LIMIT');
  });

  it.each([
    ['ZIP', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])],
    ['GZIP', Buffer.from([0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0])],
    ['7z', Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 0])],
    ['RAR', Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0, 0])],
    [
      'tar',
      (() => {
        const bytes = Buffer.alloc(512);
        bytes.write('ustar', 257, 'ascii');
        return bytes;
      })(),
    ],
  ])('rejects a renamed opaque %s container in the worktree', (
    _label,
    bytes,
  ) => {
    const paths = scannerRepository();
    const relativePath = 'public/ordinary-container.bin';
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
      expect(() => verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        scanRoots: [],
        trackedPaths: [relativePath],
      })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_OPAQUE_ARCHIVE');
    } finally {
      bytes.fill(0);
    }
  });

  it('rejects a prefixed self-extracting ZIP container in the worktree', () => {
    const paths = scannerRepository();
    const relativePath = 'public/prefixed-container.bin';
    const bytes = prefixedEmptyZipFixture();
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
      expect(() => verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        scanRoots: [],
        trackedPaths: [relativePath],
      })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_OPAQUE_ARCHIVE');
    } finally {
      bytes.fill(0);
    }
  });

  it('rejects a prefixed ZIP from the staged blob, not a safer worktree', () => {
    const paths = scannerRepository();
    const relativePath = 'public/staged-prefixed-container.bin';
    runFixtureGit(paths.repositoryRoot, ['init', '--quiet']);
    const bytes = prefixedEmptyZipFixture();
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
      runFixtureGit(paths.repositoryRoot, ['add', '--', relativePath]);
    } finally {
      bytes.fill(0);
    }
    writeFileSync(join(paths.repositoryRoot, relativePath), 'ordinary replacement\n');

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_OPAQUE_ARCHIVE');
  });

  it('rejects opaque archive magic from the staged blob, not a safer worktree', () => {
    const paths = scannerRepository();
    const relativePath = 'public/staged-container.snapshot';
    runFixtureGit(paths.repositoryRoot, ['init', '--quiet']);
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
      runFixtureGit(paths.repositoryRoot, ['add', '--', relativePath]);
    } finally {
      bytes.fill(0);
    }
    writeFileSync(join(paths.repositoryRoot, relativePath), 'ordinary replacement\n');

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_OPAQUE_ARCHIVE');
  });

  it.each([
    ['PNG media', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ['GLB media', Buffer.from([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])],
    [
      'binary with one interior ZIP-like signature',
      Buffer.from([0x80, 0x81, 0x50, 0x4b, 0x03, 0x04, 0x82, 0x83]),
    ],
    [
      'binary with two incomplete interior ZIP-like signatures',
      Buffer.from([
        0x80, 0x81,
        0x50, 0x4b, 0x03, 0x04,
        0x82, 0x83,
        0x50, 0x4b, 0x05, 0x06,
        0x84, 0x85,
      ]),
    ],
  ])('does not classify harmless %s as an opaque archive', (_label, bytes) => {
    const paths = scannerRepository();
    const relativePath = 'public/ordinary-media.bin';
    try {
      writeFileSync(join(paths.repositoryRoot, relativePath), bytes);
      expect(verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        scanRoots: [],
        trackedPaths: [relativePath],
      })).toMatchObject({ trackedPathCount: 1 });
    } finally {
      bytes.fill(0);
    }
  });

  it('scans tracked binaries outside ordinary deploy roots for private package markers', () => {
    const paths = scannerRepository();
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    writeFileSync(
      join(paths.repositoryRoot, 'tools', 'ordinary-cache.bin'),
      Buffer.from(['WKGR-PRIVATE-', 'PACKAGE-V1'].join(''), 'utf8'),
    );

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: ['tools/ordinary-cache.bin'],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
  });

  it('rejects a renamed private preview by its embedded marker', () => {
    const paths = scannerRepository();
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    writeFileSync(
      join(paths.repositoryRoot, 'tools', 'ordinary-map.png'),
      Buffer.from(['synthetic-png-fixture\0WKGR-PRIVATE-', 'PREVIEW-V1'].join(''), 'utf8'),
    );

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: ['tools/ordinary-map.png'],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
  });

  it('rejects a renamed private seed envelope outside deploy roots', () => {
    const paths = scannerRepository();
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    const seed = Uint8Array.from({ length: 32 }, (_, index) => index);
    const envelope = encodeGreaterRealmPrivateSeed(seed, 'batch');
    try {
      writeFileSync(join(paths.repositoryRoot, 'tools', 'ordinary-key.dat'), envelope);
    } finally {
      envelope.fill(0);
      seed.fill(0);
    }

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: ['tools/ordinary-key.dat'],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
  });

  it('scans reviewed generator sources beyond their exact literal allowances', () => {
    const paths = scannerRepository();
    const atlasDirectory = join(paths.repositoryRoot, 'scripts', 'atlas');
    mkdirSync(atlasDirectory, { recursive: true });
    const source = readFileSync(
      join(import.meta.dirname, '..', 'scripts', 'atlas', 'greater-realm-cli.ts'),
      'utf8',
    );
    writeFileSync(
      join(atlasDirectory, 'greater-realm-cli.ts'),
      `${source}\nconst accidentallyCommittedSeed = "${'ab'.repeat(32)}";\n`
        + `const accidentallyCommittedMarker = "${[
          'WKGR-PRIVATE-',
          'SEED-V1',
        ].join('')}";\n`,
    );

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: ['scripts/atlas/greater-realm-cli.ts'],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
  });

  it('rejects renamed raw seeds while allowing public source-integrity digests', () => {
    const paths = scannerRepository();
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    for (const name of ['raw-seed.py', 'raw-seed.script']) {
      writeFileSync(
        join(paths.repositoryRoot, 'tools', name),
        `rootSeed = "${'cd'.repeat(32)}"\n`,
      );
      expect(() => verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        trackedPaths: [`tools/${name}`],
      })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
      rmSync(join(paths.repositoryRoot, 'tools', name));
    }

    const base64Seed = Buffer.from(
      Uint8Array.from({ length: 32 }, (_, index) => (index * 37 + 11) & 0xff),
    ).toString('base64url');
    writeFileSync(
      join(paths.repositoryRoot, 'tools', 'raw-seed.toml'),
      `rootSeed = "${base64Seed}"\n`,
    );
    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: ['tools/raw-seed.toml'],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
    rmSync(join(paths.repositoryRoot, 'tools', 'raw-seed.toml'));

    writeFileSync(
      join(paths.repositoryRoot, 'tools', 'ordinary-digest.ts'),
      `const reportDigest = "${'ef'.repeat(32)}";\n`,
    );
    expect(verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: ['tools/ordinary-digest.ts'],
    })).toMatchObject({ trackedPathCount: 1 });

    writeFileSync(
      join(paths.repositoryRoot, 'tools', 'public-launcher-digest.yml'),
      `WARPKEEP_NOTIFICATION_PAGES_PROTECTED_DEPLOY_LAUNCHER_SHA256: '${'ac'.repeat(32)}'\n`,
    );
    expect(verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: ['tools/public-launcher-digest.yml'],
    })).toMatchObject({ trackedPathCount: 1 });

    writeFileSync(
      join(paths.repositoryRoot, 'tools', 'private-named-launcher-value.yml'),
      `WARPKEEP_NOTIFICATION_PAGES_PRIVATE_DEPLOY_LAUNCHER_SHA256: '${'ac'.repeat(32)}'\n`,
    );
    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: ['tools/private-named-launcher-value.yml'],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('scans exact extensionless text names and template-style suffixes', () => {
    const paths = scannerRepository();
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    const cases = [
      ['Dockerfile', `ENV ROOT_SEED="${'9a'.repeat(32)}"\n`],
      ['.env.example', `privateSeed="${'b7'.repeat(32)}"\n`],
    ] as const;
    for (const [name, source] of cases) {
      const relativePath = `tools/${name}`;
      writeFileSync(join(paths.repositoryRoot, relativePath), source);
      expect(() => verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        trackedPaths: [relativePath],
      })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
    }
  });

  it('treats production source maps as text and rejects embedded seed material', () => {
    const paths = scannerRepository();
    writeFileSync(
      join(paths.repositoryRoot, 'dist', 'application.js.map'),
      JSON.stringify({
        version: 3,
        sources: ['private-generator.ts'],
        sourcesContent: [`const candidateSeed = "${'12'.repeat(32)}";`],
      }),
    );

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('normalizes nested source-map escapes before checking private identifiers', () => {
    const paths = scannerRepository();
    writeFileSync(
      join(paths.repositoryRoot, 'dist', 'escaped-application.js.map'),
      JSON.stringify({
        version: 3,
        sources: ['private-generator.ts'],
        sourcesContent: [
          `const root\\u0053eed = "${'21'.repeat(16)}" + "${'21'.repeat(16)}";`,
        ],
      }),
    );

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('normalizes common concatenation and ASCII-escape seed obfuscation', () => {
    const paths = scannerRepository();
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    const cases = [
      `const rootSeed = "${'34'.repeat(16)}" + "${'34'.repeat(16)}";\n`,
      `const root\\u0053eed = "${'56'.repeat(32)}";\n`,
    ];
    for (const [index, source] of cases.entries()) {
      const relativePath = `tools/escaped-seed-${index}.js`;
      writeFileSync(join(paths.repositoryRoot, relativePath), source);
      expect(() => verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        trackedPaths: [relativePath],
      })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
    }
  });

  it('rejects an inline data source map before its payload can conceal private source', () => {
    const paths = scannerRepository();
    const directive = ['sourceMappingURL', 'data:application/json;base64'].join('=');
    const encoded = Buffer.from(
      `const rootSeed = "${'78'.repeat(32)}";`,
      'utf8',
    ).toString('base64');
    writeFileSync(
      join(paths.repositoryRoot, 'dist', 'inline-map.js'),
      `//# ${directive},${encoded}\n`,
    );

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('rejects renamed private JSON outside the ordinary deploy roots', () => {
    const paths = scannerRepository();
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    const privateBatchKind = ['warpkeep.greater-realm.private-', 'batch.v1'].join('');
    writeFileSync(
      join(paths.repositoryRoot, 'tools', 'ordinary-review.json'),
      `${JSON.stringify({ kind: privateBatchKind, candidates: [] })}\n`,
    );

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: ['tools/ordinary-review.json'],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
  });

  it.each([
    [
      'renamed JSON authority arrays',
      'tools/ordinary-layout.json',
      `${JSON.stringify(Object.fromEntries([
        ['dressingExcluded', Array.of(0, 1, 0, 0)],
        ['ecologyClass', Array.of(2, 0, 4, 6)],
        ['vegetationDensity', Array.of(80, 0, 150, 220)],
        ['groundcoverDensity', Array.of(60, 0, 180, 210)],
        ['wildflowerDensity', Array.of(12, 0, 96, 140)],
        ['routeClass', Array.of(0, 3, 1, 0)],
        ['landmarkClass', Array.of(0, 0, 4, 7)],
        ['ambientLifeClass', Array.of(1, 0, 4, 5)],
      ]))}\n`,
    ],
    [
      'plain encoded authority array',
      'tools/ordinary-channel.txt',
      `${['ambient-life', 'class'].join('-')}: ${JSON.stringify([1, 0, 4, 5])}\n`,
    ],
    [
      'renamed encoded authority inventory',
      'tools/ordinary-inventory.json',
      `${JSON.stringify({
        fields: [
          { name: 'dressing-excluded', type: 2, width: 1 },
          { name: 'ecology-class', type: 2, width: 1 },
          { name: 'vegetation-density', type: 2, width: 1 },
          { name: 'groundcover-density', type: 2, width: 1 },
          { name: 'wildflower-density', type: 2, width: 1 },
          { name: 'route-class', type: 2, width: 1 },
          { name: 'landmark-class', type: 2, width: 1 },
          { name: 'ambient-life-class', type: 2, width: 1 },
        ],
        encodedByteArrays: ['AAEAAA==', 'AgAEBg=='],
      })}\n`,
    ],
  ])('rejects markerless %s in tracked data', (_label, relativePath, payload) => {
    const paths = scannerRepository();
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    expect(payload).not.toContain('WKGR-PRIVATE');
    writeFileSync(join(paths.repositoryRoot, relativePath), payload);

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('rejects markerless JSON containing complete private relief metrics', () => {
    const paths = scannerRepository();
    const relativePath = 'tools/ordinary-relief.json';
    const reliefMetrics = Object.fromEntries([
      [['eligibleCell', 'Count'].join(''), 12_345],
      [['pairCountsByLag', 'AndAxis'].join(''), [[12_000, 11_900, 11_800], [9_000, 8_900, 8_800], [4_000, 3_900, 3_800]]],
      [['pairCoverageBasisPointsByLag', 'AndAxis'].join(''), [[9_721, 9_640, 9_559], [7_290, 7_209, 7_128], [3_240, 3_159, 3_078]]],
      [['meanSquaredDifferenceByLag', 'AndAxis'].join(''), [[500, 510, 520], [5_000, 5_100, 5_200], [17_000, 17_100, 17_200]]],
      [['lagOneToFourGrowthBasisPointsBy', 'Axis'].join(''), [100_000, 100_000, 100_000]],
      [['lagFourToTwelveGrowthBasisPointsBy', 'Axis'].join(''), [34_000, 33_529, 33_077]],
      [['axialAnisotropyBasisPointsBy', 'Lag'].join(''), [10_400, 10_400, 10_118]],
      [['pairCoverage', 'Proof'].join(''), true],
      [['scaleGrowth', 'Proof'].join(''), true],
      [['axialAnisotropy', 'Proof'].join(''), true],
      ['proof', true],
    ]);
    const payload = `${JSON.stringify({
      reliefStructure: {
        version: 'greater-realm-final-relief-structure-v1',
        ...reliefMetrics,
      },
    })}\n`;
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    expect(payload).not.toContain('WKGR-PRIVATE');
    writeFileSync(join(paths.repositoryRoot, relativePath), payload);

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it.each([
    [
      'one pair-count matrix in JSON',
      'tools/ordinary-relief-pairs.json',
      `${JSON.stringify(Object.fromEntries([
        [['pairCountsByLag', 'AndAxis'].join(''), [[1, 2, 3], [4, 5, 6], [7, 8, 9]]],
      ]))}\n`,
    ],
    [
      'one second-moment matrix in data',
      'tools/ordinary-relief-moments.data',
      `${['meanSquaredDifferenceByLag', 'AndAxis'].join('')}=[[1,2,3],[4,5,6],[7,8,9]]\n`,
    ],
    [
      'one scale-growth vector in JSON',
      'tools/ordinary-relief-growth.json',
      `${JSON.stringify(Object.fromEntries([
        [['lagOneToFourGrowthBasisPointsBy', 'Axis'].join(''), [10, 20, 30]],
      ]))}\n`,
    ],
    [
      'one eligible-cell scalar in data',
      'tools/ordinary-relief-count.data',
      'eligibleCellCount=12345\n',
    ],
    [
      'one relief subproof scalar in data',
      'tools/ordinary-relief-proof.data',
      `${['scaleGrowth', 'Proof'].join('')}=true\n`,
    ],
  ])('rejects markerless relief authority with %s', (
    _label,
    relativePath,
    payload,
  ) => {
    const paths = scannerRepository();
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    writeFileSync(join(paths.repositoryRoot, relativePath), payload);

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it.each([
    [
      'distinctive pair-count matrix in Markdown',
      'docs/leak.md',
      `${['pairCountsByLag', 'AndAxis'].join('')}: [[1,2,3],[4,5,6],[7,8,9]]\n`,
    ],
    [
      'parenthesized pair-count matrix in source',
      'src/leak-parenthesized-matrix.ts',
      `export const ${['pairCountsByLag', 'AndAxis'].join('')} = ([[1,2,3]]);\n`,
    ],
    [
      'frozen parenthesized scale-growth vector in source',
      'src/leak-parenthesized-vector.ts',
      `export const ${['lagOneToFourGrowthBasisPointsBy', 'Axis'].join('')} = Object.freeze(([1,2,3]));\n`,
    ],
    [
      'distinctive second-moment matrix in source',
      'src/leak.ts',
      `export const ${['meanSquaredDifferenceByLag', 'AndAxis'].join('')} = [[1,2,3],[4,5,6],[7,8,9]];\n`,
    ],
    [
      'named relief subproof in source',
      'src/leak-proof.ts',
      `export const ${['scaleGrowth', 'Proof'].join('')} = true;\n`,
    ],
    [
      'typed pair-count authority in source',
      'src/leak-typed.ts',
      `export const ${['pairCountsByLag', 'AndAxis'].join('')} = new Uint32Array([1,2,3,4,5,6,7,8,9]);\n`,
    ],
    [
      'parenthesized typed pair-count authority in source',
      'src/leak-parenthesized-typed.ts',
      `export const ${['pairCountsByLag', 'AndAxis'].join('')} = (new Uint32Array([1,2]));\n`,
    ],
    [
      'typed second-moment authority via from',
      'src/leak-from.ts',
      `export const ${['meanSquaredDifferenceByLag', 'AndAxis'].join('')} = Uint32Array.from([1,2,3,4,5,6,7,8,9]);\n`,
    ],
    [
      'buffer-backed scale-growth authority',
      'src/leak-buffer.ts',
      `export const ${['lagOneToFourGrowthBasisPointsBy', 'Axis'].join('')} = Buffer.from([10,20,30]);\n`,
    ],
    [
      'object-shaped pair-count authority in JSON',
      'docs/leak-relief.json',
      `${JSON.stringify(Object.fromEntries([
        [
          ['pairCountsByLag', 'AndAxis'].join(''),
          { lag1: [1, 2, 3], lag4: [4, 5, 6], lag12: [7, 8, 9] },
        ],
      ]))}\n`,
    ],
    [
      'object-shaped pair-count authority in source',
      'src/leak-relief-object.ts',
      `export const ${['pairCountsByLag', 'AndAxis'].join('')} = { lag1: [1], lag4: [2], lag12: [3] };\n`,
    ],
    [
      'parenthesized object-shaped pair-count authority in source',
      'src/leak-relief-parenthesized-object.ts',
      `export const ${['pairCountsByLag', 'AndAxis'].join('')} = ({ lag1: [1] });\n`,
    ],
    [
      'frozen parenthesized object-shaped pair-count authority in source',
      'src/leak-relief-frozen-object.ts',
      `export const ${['pairCountsByLag', 'AndAxis'].join('')} = Object.freeze(({ lag1: [1] }));\n`,
    ],
  ])('rejects an initialized %s', (_label, relativePath, payload) => {
    const paths = scannerRepository();
    writeFileSync(join(paths.repositoryRoot, relativePath), payload);

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('allows relief metric vocabulary and type declarations without values', () => {
    const paths = scannerRepository();
    const sourcePath = 'src/relief-structure-types.ts';
    const documentationPath = 'docs/relief-structure-vocabulary.md';
    writeFileSync(join(paths.repositoryRoot, sourcePath), [
      'export interface ReliefStructureMetrics {',
      '  eligibleCellCount: number;',
      '  pairCountsByLagAndAxis: readonly (readonly number[])[];',
      '  meanSquaredDifferenceByLagAndAxis: readonly (readonly number[])[];',
      '  lagOneToFourGrowthBasisPointsByAxis: readonly number[];',
      '}',
      '',
    ].join('\n'));
    writeFileSync(join(paths.repositoryRoot, documentationPath), [
      '# Relief structure vocabulary',
      '',
      '`pairCountsByLagAndAxis` and `meanSquaredDifferenceByLagAndAxis` are',
      'private metric field names; this document intentionally has no values.',
      '',
    ].join('\n'));

    expect(verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [sourcePath, documentationPath],
    })).toMatchObject({ trackedPathCount: 2 });
  });

  it('rejects a markerless initialized authority array embedded in source', () => {
    const paths = scannerRepository();
    const relativePath = 'tools/ordinary-layout.ts';
    const authorityName = ['ecology', 'Class'].join('');
    const payload = `export const ${authorityName} = ${JSON.stringify([2, 0, 4, 6])};\n`;
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    expect(payload).not.toContain('WKGR-PRIVATE');
    writeFileSync(join(paths.repositoryRoot, relativePath), payload);

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('rejects initialized private hydrology authority and aggregate QA reports', () => {
    const paths = scannerRepository();
    const hydrologyPath = 'tools/private-water.ts';
    const reportPath = 'tools/ordinary-report.json';
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    writeFileSync(
      join(paths.repositoryRoot, hydrologyPath),
      `export const ${['water', 'BodyId'].join('')} = new Uint8Array([1, 2, 3]);\n`,
    );
    writeFileSync(
      join(paths.repositoryRoot, reportPath),
      `${JSON.stringify({
        [['topographic', 'Qa'].join('')]: { cellCount: 100_000 },
      })}\n`,
    );
    for (const relativePath of [hydrologyPath, reportPath]) {
      expect(() => verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        trackedPaths: [relativePath],
      })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
    }
  });

  it('rejects markerless private domain-material authority in data and binary files', () => {
    const paths = scannerRepository();
    const dataPath = 'tools/private-domain.json';
    const binaryPath = 'tools/ordinary-domain.bin';
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    writeFileSync(
      join(paths.repositoryRoot, dataPath),
      `${JSON.stringify({
        [['base', 'Thickness'].join('')]: 420,
        [['rock', 'Family'].join('')]: 3,
      })}\n`,
    );
    writeFileSync(
      join(paths.repositoryRoot, binaryPath),
      Buffer.from(['RoCk', 'FaMiLy'].join('-'), 'utf16le'),
    );

    for (const relativePath of [dataPath, binaryPath]) {
      expect(() => verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        trackedPaths: [relativePath],
      })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
    }
  });

  it.each([
    [
      'domain-material metrics',
      'tools/domain-metrics.json',
      () => `${JSON.stringify({
        [['minimumBase', 'Thickness'].join('')]: 28_000,
        [['maximumBase', 'Thickness'].join('')]: 52_000,
        [['rockFamily', 'Counts'].join('')]: [0, 2, 1],
      })}\n`,
    ],
    [
      'final-hydrology metrics',
      'tools/hydrology-metrics.data',
      () => `${JSON.stringify({
        [['waterCellCountsBy', 'Regime'].join('')]: [0, 10, 2, 3, 4, 1, 5],
        [['waterBodyCountsBy', 'Regime'].join('')]: [0, 1, 1, 2, 2, 1, 3],
        [['waterCellCountsByDepth', 'Class'].join('')]: [0, 8, 9, 8],
      })}\n`,
    ],
    [
      'strategic subreport in source',
      'tools/strategic-metrics.ts',
      () => `export const ${['regionBoundary', 'Alignment'].join('')} = { proof: true, boundaryEdgeCount: 12 };\n`,
    ],
    [
      'regional hydrogeomorphology report',
      'tools/regional-metrics.json',
      () => `${JSON.stringify({
        [['regionalHydro', 'geomorphology'].join('')]: {
          frostmere: { proof: true },
          mirefen: { proof: true },
          sunscar: { proof: true },
          stonewake: { proof: true },
          tierII: { proof: true },
          throneheart: { proof: true },
          proof: true,
        },
      })}\n`,
    ],
    [
      'chunk benchmark metrics',
      'tools/chunk-metrics.json',
      () => `${JSON.stringify({
        [['selectedAxis', 'Span'].join('')]: 15,
        [['reviewedPopulationCellShareBasis', 'Points'].join('')]: 9_500,
      })}\n`,
    ],
    [
      'topography patch-support metrics',
      'tools/patch-metrics.json',
      () => `${JSON.stringify({
        [['lodSample', 'Counts'].join('')]: [100, 40, 20, 8],
        [['ridgeOrValleySupportCell', 'Count'].join('')]: 50,
      })}\n`,
    ],
  ] as const)('rejects an extracted private %s', (_label, relativePath, payload) => {
    const paths = scannerRepository();
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    writeFileSync(join(paths.repositoryRoot, relativePath), payload());
    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it.each([
    [
      'typed-array of factory',
      ['lodSample', 'Counts'].join(''),
      (name: string) => `export const ${name} = Uint32Array.of(100, 40, 20, 8);\n`,
    ],
    [
      'typed-array from factory',
      ['rockFamily', 'Counts'].join(''),
      (name: string) => `export const ${name} = Uint16Array.from([0, 2, 1]);\n`,
    ],
    [
      'typed-array constructor',
      ['waterCellCountsBy', 'Regime'].join(''),
      (name: string) => `export const ${name} = new Uint32Array([0, 10, 2, 3]);\n`,
    ],
    [
      'frozen array',
      ['lodSample', 'Counts'].join(''),
      (name: string) => `export const ${name} = Object.freeze([100, 40, 20, 8]);\n`,
    ],
    [
      'frozen typed array',
      ['rockFamily', 'Counts'].join(''),
      (name: string) => (
        `export const ${name} = Object.freeze(new Uint8Array([0, 2, 1]));\n`
      ),
    ],
    [
      'encoded Buffer call',
      ['waterCellCountsByDepth', 'Class'].join(''),
      (name: string) => `export const ${name} = Buffer.from("AAECAw==", "base64");\n`,
    ],
    [
      'encoded atob call',
      ['lodSample', 'Counts'].join(''),
      (name: string) => `export const ${name} = globalThis.atob("AAECAw==");\n`,
    ],
    [
      'encoded frozen object',
      ['rockFamily', 'Counts'].join(''),
      (name: string) => (
        `export const ${name} = Object.freeze({ encoding: "base64", data: "AAECAw==" });\n`
      ),
    ],
    [
      'encoded string',
      ['waterCellCountsBy', 'Regime'].join(''),
      (name: string) => `export const ${name} = "AAECAw==";\n`,
    ],
  ] as const)('rejects a markerless advanced aggregate %s initializer in source', (
    _label,
    authorityName,
    fixture,
  ) => {
    for (const staged of [false, true]) {
      const paths = scannerRepository();
      const relativePath = `src/advanced-${_label.replaceAll(' ', '-')}.ts`;
      if (staged) runFixtureGit(paths.repositoryRoot, ['init', '--quiet']);
      writeFileSync(join(paths.repositoryRoot, relativePath), fixture(authorityName));
      if (staged) {
        runFixtureGit(paths.repositoryRoot, ['add', '--', relativePath]);
        writeFileSync(join(paths.repositoryRoot, relativePath), 'ordinary replacement\n');
      }

      expect(() => verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        scanRoots: [],
        ...(staged ? {} : { trackedPaths: [relativePath] }),
      })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
    }
  });

  it('allows advanced aggregate vocabulary and type declarations without values', () => {
    const paths = scannerRepository();
    const sourcePath = 'src/advanced-aggregate-types.ts';
    const documentationPath = 'docs/advanced-aggregate-vocabulary.md';
    writeFileSync(join(paths.repositoryRoot, sourcePath), [
      'export interface AdvancedAggregateMetrics {',
      '  lodSampleCounts: readonly number[];',
      '  rockFamilyCounts: Uint32Array;',
      '  waterCellCountsByRegime: ReadonlyArray<number>;',
      '  localNormalGenerationProof: boolean;',
      '  regionalHydrogeomorphology: Readonly<Record<string, unknown>>;',
      '}',
      'export declare const selectedAxisSpan: number;',
      '',
    ].join('\n'));
    writeFileSync(join(paths.repositoryRoot, documentationPath), [
      '# Advanced aggregate vocabulary',
      '',
      '`lodSampleCounts`, `rockFamilyCounts`, and `regionalHydrogeomorphology`',
      'are private metric names; this document intentionally contains no values.',
      '',
    ].join('\n'));

    expect(verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [sourcePath, documentationPath],
    })).toMatchObject({ trackedPathCount: 2 });
  });

  it.each([
    [
      'Buffer.from string',
      ['groundcover', 'Density'].join(''),
      (name: string) => `export const ${name} = Buffer.from("AQIDBA==", "base64");\n`,
    ],
    [
      'atob string',
      ['wildflower', 'Density'].join(''),
      (name: string) => `export const ${name} = atob("AQIDBA==");\n`,
    ],
    [
      'Uint8Array-wrapped string',
      ['groundcover', 'Density'].join(''),
      (name: string) => [
        `export const ${name} = Uint8Array.from(atob("AQIDBA=="),`,
        '  value => value.charCodeAt(0));',
        '',
      ].join('\n'),
    ],
    [
      'encoded object',
      ['wildflower', 'Density'].join(''),
      (name: string) => [
        `export const ${name} = {`,
        '  encoding: "base64",',
        '  data: "AQIDBA==",',
        '};',
        '',
      ].join('\n'),
    ],
    [
      'Uint8Array.of numbers',
      ['groundcover', 'Density'].join(''),
      (name: string) => `export const ${name} = Uint8Array.of(12, 34, 56);\n`,
    ],
    [
      'Buffer-wrapped Uint8Array.of numbers',
      ['wildflower', 'Density'].join(''),
      (name: string) => (
        `export const ${name} = Buffer.from(Uint8Array.of(7, 8, 9));\n`
      ),
    ],
    [
      'Buffer-wrapped Uint8Array numbers',
      ['groundcover', 'Density'].join(''),
      (name: string) => (
        `export const ${name} = Buffer.from(new Uint8Array([1, 2, 3]));\n`
      ),
    ],
    [
      'Buffer-wrapped Uint8Array.from numbers',
      ['wildflower', 'Density'].join(''),
      (name: string) => (
        `export const ${name} = Buffer.from(Uint8Array.from([4, 5, 6]));\n`
      ),
    ],
    [
      'Uint8Array-wrapped Buffer numbers',
      ['groundcover', 'Density'].join(''),
      (name: string) => (
        `export const ${name} = new Uint8Array(Buffer.from([7, 8, 9]));\n`
      ),
    ],
  ])('rejects a markerless %s authority initializer embedded in source', (
    _label,
    authorityName,
    fixture,
  ) => {
    for (const staged of [false, true]) {
      const paths = scannerRepository();
      const relativePath = `src/encoded-${_label.replaceAll(' ', '-')}.ts`;
      if (staged) runFixtureGit(paths.repositoryRoot, ['init', '--quiet']);
      writeFileSync(join(paths.repositoryRoot, relativePath), fixture(authorityName));
      if (staged) {
        runFixtureGit(paths.repositoryRoot, ['add', '--', relativePath]);
        writeFileSync(join(paths.repositoryRoot, relativePath), 'ordinary replacement\n');
      }

      expect(() => verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        scanRoots: [],
        ...(staged ? {} : { trackedPaths: [relativePath] }),
      })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
    }
  });

  it.each([
    ['csv column', 'tools/ecology.csv', 'ecologyClass\n1\n2\n'],
    ['case-folded CSV column', 'tools/folded-ecology.csv', 'EcologyClass\n1\n'],
    [
      'quoted CSV column',
      'tools/quoted-ecology.csv',
      'description,ecologyClass\n"ordinary,description",1\n',
    ],
    [
      'quoted multiline CSV column',
      'tools/multiline-ecology.csv',
      'description,ecologyClass\n"ordinary, ""quoted""\ndescription",1\n',
    ],
    ['tsv column', 'tools/ecology.tsv', 'name\tambient-life-class\nordinary\t5\n'],
    [
      'quoted TSV column',
      'tools/quoted-ecology.tsv',
      'description\tecologyClass\n"ordinary\tdescription"\t1\n',
    ],
    ['data row', 'tools/routes.data', 'route-class 3\n'],
    ['data key/value row', 'tools/ecology.data', 'ecologyClass=1\n'],
    ['TXT key/value row', 'tools/ecology.txt', 'ecologyClass=1\n'],
    ['unknown key/value row', 'tools/ecology.snapshot', 'AMBIENT-LIFE-CLASS:5\n'],
    ['dat row', 'tools/landmarks.dat', 'landmarkClass|7\n'],
    ['dat key/value row', 'tools/routes.dat', 'route-class: 3\n'],
    [
      'JSON array of objects',
      'tools/ecology.json',
      '[{"ecologyClass":1},{"ecologyClass":2}]\n',
    ],
    [
      'JSON object map',
      'tools/routes.json',
      '{"cell-a":{"routeClass":3},"cell-b":{"routeClass":4}}\n',
    ],
    [
      'JSON encoded string',
      'tools/ecology-encoded.json',
      '{"ecologyClass":"AgAEBg=="}\n',
    ],
    [
      'JSON encoded object',
      'tools/routes-encoded.json',
      `${JSON.stringify(Object.fromEntries([
        [
          ['route', 'Class'].join(''),
          { encoding: 'base64', data: 'AwQ=' },
        ],
      ]))}\n`,
    ],
    ['NDJSON value', 'tools/vegetation.ndjson', '{"vegetationDensity":120}\n'],
    [
      'case-folded groundcover JSON value',
      'tools/groundcover.json',
      '{"GrOuNdCoVeRdEnSiTy":180}\n',
    ],
    [
      'wildflower TSV column',
      'tools/wildflowers.tsv',
      'name\twildflower-density\nordinary\t96\n',
    ],
  ])('rejects a markerless single authority field with numeric %s', (
    _label,
    relativePath,
    payload,
  ) => {
    const paths = scannerRepository();
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    writeFileSync(join(paths.repositoryRoot, relativePath), payload);

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  });

  it('allows a tabular vocabulary label when no numeric authority values are present', () => {
    const paths = scannerRepository();
    const relativePath = 'tools/living-world-vocabulary.csv';
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    writeFileSync(join(paths.repositoryRoot, relativePath), [
      'ecologyClass,description',
      'ordinary-label,private vocabulary without authority values',
      '',
    ].join('\n'));

    expect(verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      scanRoots: [],
      trackedPaths: [relativePath],
    })).toMatchObject({ trackedPathCount: 1 });
  });

  it('allows living-world vocabulary in source, documentation, and type declarations', () => {
    const paths = scannerRepository();
    const sourcePath = 'src/living-world-types.ts';
    const documentationPath = 'docs/living-world-vocabulary.md';
    writeFileSync(join(paths.repositoryRoot, sourcePath), [
      'export interface LivingWorldAuthority {',
      '  dressingExcluded: Uint8Array;',
      '  ecologyClass: Uint8Array;',
      '  vegetationDensity: Uint8Array;',
      '  groundcoverDensity: Uint8Array;',
      '  wildflowerDensity: Uint8Array;',
      '  routeClass: [number, number];',
      '  landmarkClass: Uint8Array;',
      '  ambientLifeClass: Uint8Array;',
      '  waterBodyId: Uint32Array;',
      '  waterDepthClass: Uint8Array;',
      '  waterSurfaceLevel: Int32Array;',
      '  waterDownstream: Int32Array;',
      '  waterBankSeed: Uint32Array;',
      '  waterGenerationVersion: Uint16Array;',
      '  baseThickness: number;',
      '  rockFamily: number;',
      '}',
      'export function allocateLivingWorld(cellCount: number) {',
      '  return {',
      '    groundcoverDensity: new Uint8Array(cellCount),',
      '    wildflowerDensity: new Uint8Array(cellCount),',
      '  };',
      '}',
      '',
    ].join('\n'));
    writeFileSync(join(paths.repositoryRoot, documentationPath), [
      '# Living-world vocabulary',
      '',
      '`dressing-excluded`, `ecology-class`, `vegetation-density`,',
      '`groundcover-density`, `wildflower-density`, `route-class`,',
      '`landmark-class`, and `ambient-life-class` are private',
      '`water-body-id`, `water-depth-class`, `water-surface-level`,',
      '`water-downstream`, `water-bank-seed`, and `water-generation-version`',
      '`base-thickness` and `rock-family`',
      'authority field names; this document intentionally contains no values.',
      '',
    ].join('\n'));

    expect(verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [sourcePath, documentationPath],
    })).toMatchObject({ trackedPathCount: 2 });
  });

  it('rejects a renamed private owner shortlist outside deploy roots', () => {
    const paths = scannerRepository();
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    const privateShortlistKind = [
      'warpkeep.greater-realm.private-owner-',
      'shortlist.v1',
    ].join('');
    writeFileSync(
      join(paths.repositoryRoot, 'tools', 'ordinary-comparison.json'),
      `${JSON.stringify({ kind: privateShortlistKind, candidateHandles: [] })}\n`,
    );

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: ['tools/ordinary-comparison.json'],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
  });

  it.each([
    ['chunk-', 'manifest.v1'],
    ['topography-', 'patch.v1'],
  ])('rejects a renamed private %s manifest outside deploy roots', (prefix, suffix) => {
    const paths = scannerRepository();
    mkdirSync(join(paths.repositoryRoot, 'tools'));
    writeFileSync(
      join(paths.repositoryRoot, 'tools', 'ordinary-manifest.json'),
      `${JSON.stringify({
        kind: ['warpkeep.greater-realm.private-', prefix, suffix].join(''),
      })}\n`,
    );

    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: ['tools/ordinary-manifest.json'],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
  });

  it('rejects owner preview images and symlinks beneath public scan roots', () => {
    const paths = scannerRepository();
    const evidence = join(paths.repositoryRoot, 'docs', 'evidence', 'greater-realm');
    mkdirSync(evidence, { recursive: true });
    writeFileSync(join(evidence, 'candidate.webp'), Uint8Array.from([1, 2, 3]));
    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_PATH');

    rmSync(join(paths.repositoryRoot, 'docs'), { recursive: true });
    mkdirSync(join(paths.repositoryRoot, 'docs'));
    const external = join(paths.root, 'external.txt');
    writeFileSync(external, 'fixture');
    symlinkSync(external, join(paths.repositoryRoot, 'public', 'linked.txt'));
    expect(() => verifyGreaterRealmPublicBoundary({
      repositoryRoot: paths.repositoryRoot,
      trackedPaths: [],
    })).toThrow('GREATER_REALM_PUBLIC_BOUNDARY_SPECIAL_ENTRY');
  });

  it('does not reveal local paths or candidate values in diagnostics', () => {
    const paths = scannerRepository();
    const privatePath = join(paths.repositoryRoot, 'public', 'seed.bin');
    writeFileSync(privatePath, 'controlled fixture');
    try {
      verifyGreaterRealmPublicBoundary({
        repositoryRoot: paths.repositoryRoot,
        trackedPaths: [],
      });
      throw new Error('expected boundary failure');
    } catch (error) {
      expect(String(error)).toBe('GreaterRealmPublicBoundaryError: GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_PATH');
      expect(String(error)).not.toContain(paths.root);
      expect(String(error)).not.toContain(readFileSync(privatePath, 'utf8'));
    }
  });
});
