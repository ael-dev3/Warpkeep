import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertGreaterRealmPrivateInvocation,
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

function scannerRepository() {
  const paths = isolatedPaths();
  for (const directory of ['public', 'src', 'dist', 'docs']) {
    mkdirSync(join(paths.repositoryRoot, directory));
  }
  writeFileSync(join(paths.repositoryRoot, 'public', 'ordinary.txt'), 'ordinary fixture\n');
  return paths;
}

function sanitizedReviewEvidence(): string {
  const candidates = Array.from({ length: 8 }, (_, index) => Object.freeze({
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
      ['generate-candidates', '--candidate-count', '12'],
      { HOME: '/controlled/home' },
    )).not.toThrow();
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

  it('rejects renamed raw seeds in known and extensionless text while allowing a digest', () => {
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
