// Fixed, effect-free artifact ingestion seam for privileged workflow bundles.
// Importing this module performs no reads or process operations. The incomplete
// native profiles below cannot mint source authority, even with forged summaries.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';

const MAX_BYTES = 64 * 1024 * 1024;
const HEX40 = /^[a-f0-9]{40}$/u, HEX64 = /^[a-f0-9]{64}$/u;
// Keep these source-owned names independent of the producer's execution graph.
// The producer/reader contract regression verifies this exact profile inventory.
const PROFILES = Object.freeze([
  'warpkeep-native-source-test-partitions-v1',
  'warpkeep-native-source-checks-v1',
  'warpkeep-native-service-checks-v1',
]);
const sha = body => createHash('sha256').update(body).digest('hex');
const fail = code => { throw Error(`NATIVE_SOURCE_VERIFICATION_${code}`); };

function read(path, mode) {
  const value = readLocalBindingBoundedFile(path, { maximumBytes: MAX_BYTES,
    expectedUid: process.getuid?.(), ...(mode === undefined ? {} : { expectedMode: mode }) });
  return { ...value, sha256: sha(value.body) };
}
function artifact(root, path, digest) {
  const full = resolve(path);
  if (dirname(full) !== join(root, 'artifacts', 'qa')) fail('ARTIFACT_PATH_INVALID');
  const value = read(full, 0o600);
  if (value.sha256 !== digest) fail('ARTIFACT_CHANGED');
  return { path: full, sha256: value.sha256, identity: value.identity, bytes: value.body.length };
}

/** No receipt from these incomplete producers can return a source-authority proof. */
export function requireCompleteNativeSourceVerificationEvidence(locator, commit) {
  if (typeof locator !== 'string' || !HEX64.test(locator)
    || typeof commit !== 'string' || !HEX40.test(commit)) fail('EVIDENCE_LOCATOR_INVALID');
  const root = resolve(process.cwd());
  if (fs.realpathSync(root) !== root) fail('ROOT_INVALID');
  const reference = artifact(root, join(root, 'artifacts', 'qa', `native-source-verification-${locator}.json`), locator);
  const receipt = JSON.parse(read(reference.path).body);
  if (receipt.schemaVersion !== 1 || !PROFILES.includes(receipt.profile)
    || receipt.repositoryRoot !== root || receipt.source?.sourceCommit !== commit) fail('EVIDENCE_SOURCE_INVALID');
  // Do not accept echoed exit codes, coverage booleans or invented future domains.
  // Full authenticated persistence and the accepted-main profile remain unfinished.
  fail('INCOMPLETE');
}
