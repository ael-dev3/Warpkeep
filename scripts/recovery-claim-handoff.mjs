import { constants, openSync, closeSync, fstatSync, lstatSync, realpathSync, readSync, writeFileSync, fsyncSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyRecoveryClaimReceipt, verifyRecoveryClaimCorrelation } from './verify-recovery-claim-receipt.mjs';
const NAME = 'recovery-claim-v1.json';
const LIMIT = 65536;
const KEYS = ['schemaVersion', 'profile', 'claimReceiptJws', 'expectedSource', 'claimDeadline'];
const CONTEXT = ['pagesRunId', 'pagesRunAttempt', 'sourceVerifyRunId', 'sourceVerifyRunAttempt',
  'candidateCommit', 'candidateTree', 'artifactId', 'githubArtifactArchiveSha256',
  'innerArtifactTarSha256', 'contentManifestSha256', 'deploymentAttestationSha256'];
const fail = () => { throw new Error('RECOVERY_CLAIM_HANDOFF_INVALID'); };
const now = () => Math.floor(Date.now() / 1000);
function directory(root, action) {
  let fd;
  try {
    if (process.platform !== 'linux' || typeof root !== 'string' || resolve(root) !== root || realpathSync(root) !== root) fail();
    const before = lstatSync(root, { bigint: true });
    if (!before.isDirectory() || before.uid !== BigInt(process.getuid()) || (before.mode & 0o7777n) !== 0o700n) fail();
    fd = openSync(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const opened = fstatSync(fd, { bigint: true });
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.mode !== before.mode || opened.uid !== before.uid) fail();
    const result = action(fd);
    const after = lstatSync(root, { bigint: true });
    if (after.dev !== before.dev || after.ino !== before.ino || after.mode !== before.mode || after.uid !== before.uid) fail();
    return result;
  } catch { fail(); }
  finally { if (fd !== undefined) closeSync(fd); }
}

/** Existing private Linux directory only. Persists no authorization JWS or OIDC token. */
export function writeRecoveryClaimHandoff(...args) {
  let bytes;
  try {
    if (args.length !== 3) fail();
    const [root, claimReceiptJws, expectedSource] = args;
    verifyRecoveryClaimReceipt(claimReceiptJws, expectedSource, now());
    const { claimDeadline } = verifyRecoveryClaimCorrelation(claimReceiptJws, expectedSource, now());
    bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, profile: 'warpkeep-recovery-claim-handoff-v1',
      claimReceiptJws, expectedSource, claimDeadline }));
    if (bytes.length > LIMIT) fail();
    return directory(root, fd => {
      let file;
      try {
        file = openSync(`/proc/self/fd/${fd}/${NAME}`, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        writeFileSync(file, bytes); fsyncSync(file); fsyncSync(fd);
        return Object.freeze({ claimDeadline });
      } finally { if (file !== undefined) closeSync(file); }
    });
  } catch { fail(); }
  finally { bytes?.fill(0); }
}

function read(root, contextSource, deployment) {
  return directory(root, fd => {
    let file, bytes;
    try {
      if (typeof contextSource !== 'string' || contextSource.length > 16384) fail();
      const context = JSON.parse(contextSource);
      if (!context || Array.isArray(context) || typeof context !== 'object'
          || Object.keys(context).join(',') !== CONTEXT.join(',') || JSON.stringify(context) !== contextSource) fail();
      file = openSync(`/proc/self/fd/${fd}/${NAME}`, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const before = fstatSync(file, { bigint: true });
      if (!before.isFile() || before.nlink !== 1n || before.uid !== BigInt(process.getuid())
          || (before.mode & 0o7777n) !== 0o600n || before.size < 2n || before.size > BigInt(LIMIT)) fail();
      bytes = Buffer.alloc(Number(before.size) + 1);
      let length = 0, count;
      while (length < bytes.length && (count = readSync(file, bytes, length, bytes.length - length, length)) !== 0) length += count;
      const after = fstatSync(file, { bigint: true });
      if (length !== Number(before.size) || ['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].some(key => before[key] !== after[key])) fail();
      const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length));
      const value = JSON.parse(source);
      if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).join(',') !== KEYS.join(',')
          || JSON.stringify(value) !== source || value.schemaVersion !== 1 || value.profile !== 'warpkeep-recovery-claim-handoff-v1') fail();
      const correlation = verifyRecoveryClaimCorrelation(value.claimReceiptJws, value.expectedSource, now());
      if (correlation.claimDeadline !== value.claimDeadline) fail();
      const expected = JSON.parse(value.expectedSource);
      if (CONTEXT.some(key => expected[key] !== context[key])) fail();
      if (deployment) verifyRecoveryClaimReceipt(value.claimReceiptJws, value.expectedSource, now());
      // Private return values: caller must not print, summarize or upload them.
      return Object.freeze({ claimReceiptJws: value.claimReceiptJws, expectedSource: value.expectedSource });
    } finally { bytes?.fill(0); if (file !== undefined) closeSync(file); }
  });
}
export function readRecoveryClaimHandoffForDeployment(...args) {
  if (args.length !== 2) fail();
  return read(...args, true);
}
export function readRecoveryClaimHandoffForReconciliation(...args) {
  if (args.length !== 2) fail();
  return read(...args, false);
}
