import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';

import {
  ADDITIVE_MIGRATION_PROOF_SPACETIME_CLI_VERSION,
} from './spacetime-additive-migration-proof.mjs';

const EXPECTED_CLI_COMMIT = '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87';
const EXPECTED_LAUNCHER_SHA256 = Object.freeze({
  'darwin-arm64': '4d76214ab1ba1462bd1500739641ec1c8322f99529d899c28612bfa665ccdfc6',
  // The reviewed Linux archive ships the CLI directly rather than through
  // the macOS launcher, so the executable and launcher digests are identical.
  'linux-x64': 'cac13c929049f31cb588c230a0d7fe5f388505b4c64047a68b1d5cfdc811624b',
});
const EXPECTED_CLI_BINARY_SHA256 = Object.freeze({
  'darwin-arm64': '2e737ddbbd7d337bb19c8fc22da9de44be4b7b2062146e7f65aa3f298d7994d6',
  'linux-x64': 'cac13c929049f31cb588c230a0d7fe5f388505b4c64047a68b1d5cfdc811624b',
});
const EXPECTED_STANDALONE_BINARY_SHA256 = Object.freeze({
  'darwin-arm64': '15a0965f1deec6b79f67fc04b616fd1a6b8f633301b0cfd2ebb7f961b919a8fa',
  'linux-x64': 'a9185a737c9b739896c8f51326e1c3aedefba80a0f01def76ce26f358d5c187b',
});
const MAXIMUM_CLI_BYTES = 128 * 1_024 * 1_024;
const MAXIMUM_VERSION_OUTPUT_BYTES = 64 * 1_024;
const SNAPSHOT_DIRECTORY_MODE = 0o700;
const SNAPSHOT_EXECUTABLE_MODE = 0o500;
const SNAPSHOT_CLI_FILENAME = 'spacetimedb-cli';
const SNAPSHOT_STANDALONE_FILENAME = 'spacetimedb-standalone';
const SNAPSHOT_MEMBERS = Object.freeze([
  SNAPSHOT_CLI_FILENAME,
  SNAPSHOT_STANDALONE_FILENAME,
]);
const CHILD_ENVIRONMENT_KEYS = Object.freeze([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
]);

class SpacetimeCliAttestationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SpacetimeCliAttestationError';
  }
}

function fail(message) {
  throw new SpacetimeCliAttestationError(message);
}

function childEnvironment(source) {
  return Object.freeze(Object.fromEntries(
    CHILD_ENVIRONMENT_KEYS
      .filter((key) => typeof source[key] === 'string' && source[key].length > 0)
      .map((key) => [key, source[key]]),
  ));
}

function resolveExecutablePath(executable, environment) {
  if (
    typeof executable !== 'string'
    || executable.length === 0
    || executable.includes('\0')
  ) fail('The pinned SpacetimeDB CLI executable was not found.');
  const candidates = isAbsolute(executable) || executable.includes('/')
    ? [resolve(executable)]
    : (environment.PATH ?? '')
      .split(delimiter)
      .filter(Boolean)
      .map((entry) => join(entry, executable));
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch {
      // Continue until the exact executable is found or fail generically.
    }
  }
  fail('The pinned SpacetimeDB CLI executable was not found.');
}

function immutableIdentity(metadata, canonicalPath) {
  return Object.freeze({
    dev: metadata.dev,
    ino: metadata.ino,
    uid: metadata.uid,
    gid: metadata.gid,
    mode: metadata.mode,
    nlink: metadata.nlink,
    size: metadata.size,
    mtimeNs: metadata.mtimeNs,
    ctimeNs: metadata.ctimeNs,
    canonicalPath,
  });
}

function metadataMatches(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.uid === right.uid
    && left.gid === right.gid
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function identitiesMatch(left, right) {
  return metadataMatches(left, right)
    && left.canonicalPath === right.canonicalPath;
}

function failSnapshotReattestation() {
  fail('The private SpacetimeDB CLI snapshot failed re-attestation.');
}

function bindSnapshotPath(path, descriptorMetadata, kind) {
  const pathMetadata = lstatSync(path, { bigint: true });
  const canonicalPath = realpathSync(path);
  const canonicalMetadata = lstatSync(canonicalPath, { bigint: true });
  if (
    canonicalPath !== path
    || (kind === 'directory' ? !pathMetadata.isDirectory() : !pathMetadata.isFile())
    || !metadataMatches(pathMetadata, descriptorMetadata)
    || !metadataMatches(canonicalMetadata, descriptorMetadata)
  ) failSnapshotReattestation();
  return immutableIdentity(descriptorMetadata, canonicalPath);
}

function attestSnapshotDirectory(directory, expectedIdentity) {
  let descriptor;
  try {
    descriptor = openSync(
      directory,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY,
    );
    const before = fstatSync(descriptor, { bigint: true });
    const beforeIdentity = bindSnapshotPath(directory, before, 'directory');
    if (
      !before.isDirectory()
      || (before.mode & 0o7777n) !== BigInt(SNAPSHOT_DIRECTORY_MODE)
      || before.nlink < 1n
      || (expectedIdentity !== undefined && !identitiesMatch(beforeIdentity, expectedIdentity))
    ) failSnapshotReattestation();
    const members = readdirSync(directory).sort();
    if (
      members.length !== SNAPSHOT_MEMBERS.length
      || members.some((member, index) => member !== SNAPSHOT_MEMBERS[index])
    ) failSnapshotReattestation();
    const after = fstatSync(descriptor, { bigint: true });
    const afterIdentity = bindSnapshotPath(directory, after, 'directory');
    if (
      !identitiesMatch(beforeIdentity, afterIdentity)
      || (expectedIdentity !== undefined && !identitiesMatch(afterIdentity, expectedIdentity))
    ) failSnapshotReattestation();
    return afterIdentity;
  } catch (error) {
    if (error instanceof SpacetimeCliAttestationError) throw error;
    failSnapshotReattestation();
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
  }
}

function attestSnapshotExecutable(path, expectedDigest, expectedIdentity) {
  let descriptor;
  let bytes;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    const beforeIdentity = bindSnapshotPath(path, before, 'file');
    if (
      !before.isFile()
      || before.size < 1n
      || before.size > BigInt(MAXIMUM_CLI_BYTES)
      || (before.mode & 0o7777n) !== BigInt(SNAPSHOT_EXECUTABLE_MODE)
      || before.nlink !== 1n
      || (expectedIdentity !== undefined && !identitiesMatch(beforeIdentity, expectedIdentity))
    ) failSnapshotReattestation();
    bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const afterIdentity = bindSnapshotPath(path, after, 'file');
    if (
      !identitiesMatch(beforeIdentity, afterIdentity)
      || BigInt(bytes.byteLength) !== after.size
      || createHash('sha256').update(bytes).digest('hex') !== expectedDigest
      || (expectedIdentity !== undefined && !identitiesMatch(afterIdentity, expectedIdentity))
    ) failSnapshotReattestation();
    return afterIdentity;
  } catch (error) {
    if (error instanceof SpacetimeCliAttestationError) throw error;
    failSnapshotReattestation();
  } finally {
    bytes?.fill(0);
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
  }
}

function attestPrivateSnapshot(
  directory,
  cliPath,
  cliDigest,
  standalonePath,
  standaloneDigest,
  expectedState,
) {
  const directoryIdentity = attestSnapshotDirectory(
    directory,
    expectedState?.directory,
  );
  const cliIdentity = attestSnapshotExecutable(
    cliPath,
    cliDigest,
    expectedState?.cli,
  );
  const standaloneIdentity = attestSnapshotExecutable(
    standalonePath,
    standaloneDigest,
    expectedState?.standalone,
  );
  attestSnapshotDirectory(directory, expectedState?.directory ?? directoryIdentity);
  return Object.freeze({
    directory: directoryIdentity,
    cli: cliIdentity,
    standalone: standaloneIdentity,
  });
}

function createExecutableSnapshot(sourcePath, expectedDigest) {
  let sourceDescriptor;
  let snapshotDescriptor;
  let directory;
  try {
    sourceDescriptor = openSync(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(sourceDescriptor);
    if (!before.isFile() || before.size < 1 || before.size > MAXIMUM_CLI_BYTES) {
      fail('The exact reviewed SpacetimeDB CLI binary was not active on this platform.');
    }
    const bytes = readFileSync(sourceDescriptor);
    const after = fstatSync(sourceDescriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || bytes.byteLength !== after.size
      || createHash('sha256').update(bytes).digest('hex') !== expectedDigest
    ) fail('The exact reviewed SpacetimeDB CLI binary was not active on this platform.');
    closeSync(sourceDescriptor);
    sourceDescriptor = undefined;

    directory = mkdtempSync(join(tmpdir(), 'warpkeep-cli-attestation-'));
    directory = realpathSync(directory);
    chmodSync(directory, SNAPSHOT_DIRECTORY_MODE);
    const directoryMetadata = statSync(directory);
    if (
      !directoryMetadata.isDirectory()
      || (directoryMetadata.mode & 0o777) !== SNAPSHOT_DIRECTORY_MODE
    ) fail('The private CLI snapshot directory was unsafe.');
    const snapshotPath = join(directory, SNAPSHOT_CLI_FILENAME);
    snapshotDescriptor = openSync(
      snapshotPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      SNAPSHOT_DIRECTORY_MODE,
    );
    writeFileSync(snapshotDescriptor, bytes);
    bytes.fill(0);
    fchmodSync(snapshotDescriptor, SNAPSHOT_EXECUTABLE_MODE);
    fsyncSync(snapshotDescriptor);
    const snapshotMetadata = fstatSync(snapshotDescriptor);
    if (
      !snapshotMetadata.isFile()
      || snapshotMetadata.size !== before.size
      || (snapshotMetadata.mode & 0o777) !== SNAPSHOT_EXECUTABLE_MODE
    ) fail('The private CLI snapshot was unsafe.');
    closeSync(snapshotDescriptor);
    snapshotDescriptor = undefined;
    let cleaned = false;
    return Object.freeze({
      path: snapshotPath,
      directory,
      digest: expectedDigest,
      cleanup() {
        if (cleaned) return;
        try {
          rmSync(directory, { recursive: true, force: true });
          cleaned = true;
        } catch {
          fail('Private CLI snapshot cleanup failed.');
        }
      },
    });
  } catch (error) {
    if (sourceDescriptor !== undefined) {
      try { closeSync(sourceDescriptor); } catch {}
    }
    if (snapshotDescriptor !== undefined) {
      try { closeSync(snapshotDescriptor); } catch {}
    }
    if (directory !== undefined) {
      try { rmSync(directory, { recursive: true, force: true }); } catch {}
    }
    if (error instanceof SpacetimeCliAttestationError) throw error;
    fail('The pinned SpacetimeDB CLI could not be attested safely.');
  }
}

function installReviewedCompanionExecutable(sourcePath, destinationPath, expectedDigest) {
  let sourceDescriptor;
  let destinationDescriptor;
  try {
    sourceDescriptor = openSync(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(sourceDescriptor);
    if (!before.isFile() || before.size < 1 || before.size > MAXIMUM_CLI_BYTES) {
      fail('The reviewed SpacetimeDB standalone binary was unavailable.');
    }
    const bytes = readFileSync(sourceDescriptor);
    const after = fstatSync(sourceDescriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || bytes.byteLength !== after.size
      || createHash('sha256').update(bytes).digest('hex') !== expectedDigest
    ) fail('The reviewed SpacetimeDB standalone binary was unavailable.');
    closeSync(sourceDescriptor);
    sourceDescriptor = undefined;
    destinationDescriptor = openSync(
      destinationPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      SNAPSHOT_DIRECTORY_MODE,
    );
    writeFileSync(destinationDescriptor, bytes);
    bytes.fill(0);
    fchmodSync(destinationDescriptor, SNAPSHOT_EXECUTABLE_MODE);
    fsyncSync(destinationDescriptor);
    const destinationMetadata = fstatSync(destinationDescriptor);
    if (
      !destinationMetadata.isFile()
      || destinationMetadata.size !== before.size
      || (destinationMetadata.mode & 0o777) !== SNAPSHOT_EXECUTABLE_MODE
    ) fail('The private SpacetimeDB standalone snapshot was unsafe.');
    closeSync(destinationDescriptor);
    destinationDescriptor = undefined;
  } catch (error) {
    if (sourceDescriptor !== undefined) {
      try { closeSync(sourceDescriptor); } catch {}
    }
    if (destinationDescriptor !== undefined) {
      try { closeSync(destinationDescriptor); } catch {}
    }
    if (error instanceof SpacetimeCliAttestationError) throw error;
    fail('The reviewed SpacetimeDB standalone binary was unavailable.');
  }
}

export function verifyPinnedCliAttestation(
  versionOutput,
  digest,
  platform = process.platform,
  arch = process.arch,
) {
  if (
    typeof versionOutput !== 'string'
    || !versionOutput.includes(
      `spacetimedb tool version ${ADDITIVE_MIGRATION_PROOF_SPACETIME_CLI_VERSION};`
    )
    || !versionOutput.includes(`Commit: ${EXPECTED_CLI_COMMIT}`)
  ) fail('The exact reviewed SpacetimeDB CLI version was not active.');
  const expectedDigest = EXPECTED_CLI_BINARY_SHA256[`${platform}-${arch}`];
  const expectedLauncherDigest = EXPECTED_LAUNCHER_SHA256[`${platform}-${arch}`];
  if (
    typeof expectedDigest !== 'string'
    || typeof expectedLauncherDigest !== 'string'
    || ![expectedDigest, expectedLauncherDigest].includes(digest)
  ) {
    fail('The exact reviewed SpacetimeDB CLI binary was not active on this platform.');
  }
}

export function attestPinnedSpacetimeCli(
  executable,
  spawnSyncProcess = spawnSync,
  sourceEnvironment = process.env,
) {
  const environment = childEnvironment(sourceEnvironment);
  const executablePath = resolveExecutablePath(executable, environment);
  const platformKey = `${process.platform}-${process.arch}`;
  const expectedDigest = EXPECTED_CLI_BINARY_SHA256[platformKey];
  const expectedLauncherDigest = EXPECTED_LAUNCHER_SHA256[platformKey];
  const expectedStandaloneDigest = EXPECTED_STANDALONE_BINARY_SHA256[platformKey];
  if (
    typeof expectedDigest !== 'string'
    || typeof expectedLauncherDigest !== 'string'
    || typeof expectedStandaloneDigest !== 'string'
  ) {
    fail('The exact reviewed SpacetimeDB CLI binary was not active on this platform.');
  }
  let snapshot;
  let reviewedCliPath = executablePath;
  try {
    snapshot = createExecutableSnapshot(executablePath, expectedDigest);
  } catch {
    let launcherSnapshot;
    try {
      launcherSnapshot = createExecutableSnapshot(executablePath, expectedLauncherDigest);
    } catch {
      fail('The exact reviewed SpacetimeDB CLI binary was not active on this platform.');
    } finally {
      launcherSnapshot?.cleanup();
    }
    reviewedCliPath = resolve(
      dirname(executablePath),
      '..',
      'share',
      'spacetime',
      'bin',
      'current',
      'spacetimedb-cli',
    );
    snapshot = createExecutableSnapshot(reviewedCliPath, expectedDigest);
  }
  const standalonePath = join(snapshot.directory, SNAPSHOT_STANDALONE_FILENAME);
  try {
    installReviewedCompanionExecutable(
      join(dirname(reviewedCliPath), 'spacetimedb-standalone'),
      standalonePath,
      expectedStandaloneDigest,
    );
  } catch (error) {
    snapshot.cleanup();
    throw error;
  }
  try {
    const snapshotState = attestPrivateSnapshot(
      snapshot.directory,
      snapshot.path,
      expectedDigest,
      standalonePath,
      expectedStandaloneDigest,
    );
    const provenance = Object.freeze({
      version: ADDITIVE_MIGRATION_PROOF_SPACETIME_CLI_VERSION,
      commit: EXPECTED_CLI_COMMIT,
      cliExecutableSha256: expectedDigest,
      standaloneExecutableSha256: expectedStandaloneDigest,
    });
    const attestedSnapshot = Object.freeze({
      path: snapshot.path,
      directory: snapshot.directory,
      digest: snapshot.digest,
      provenance,
      verify() {
        attestPrivateSnapshot(
          snapshot.directory,
          snapshot.path,
          expectedDigest,
          standalonePath,
          expectedStandaloneDigest,
          snapshotState,
        );
      },
      cleanup: snapshot.cleanup,
    });
    attestedSnapshot.verify();
    const result = spawnSyncProcess(attestedSnapshot.path, ['--version'], {
      encoding: 'utf8',
      env: environment,
      input: '',
      maxBuffer: MAXIMUM_VERSION_OUTPUT_BYTES,
      timeout: 10_000,
      killSignal: 'SIGKILL',
    });
    if (result.error || result.status !== 0 || result.signal) {
      fail('The exact reviewed SpacetimeDB CLI version could not be read safely.');
    }
    verifyPinnedCliAttestation(result.stdout, attestedSnapshot.digest);
    attestedSnapshot.verify();
    return attestedSnapshot;
  } catch (error) {
    snapshot.cleanup();
    throw error;
  }
}
