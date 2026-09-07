// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { derivePreparedSourcePins } from '../scripts/local-prepared-source-pins.mjs';

const generator = 'scripts/generate-0.4.0-sealed-launch-activation.mjs';
const verifier = 'scripts/verify-0.4.0-sealed-launch.mjs';
const bootstrap = 'scripts/greater-realm-production-bootstrap.mjs';
const stale = 'a'.repeat(64);
const pin = (name: string) => `const ${name} =\n  '${stale}';\n`;
const sourceNames = [
  ['SEALED_REALMS_SOURCE_AUTHORITY_SOURCE_SHA256', 'scripts/sealed-realms-production-source-authority.mjs'],
  ['SEALED_REALMS_SOURCE_AUTHORITY_DECLARATION_SHA256', 'scripts/sealed-realms-production-source-authority.d.mts'],
  ['GENESIS_001_POLICY_OBSERVATION_BOOTSTRAP_SOURCE_SHA256', bootstrap],
  ['GENESIS_001_POLICY_OBSERVATION_SOURCE_SHA256', 'scripts/genesis001-policy-observation-receipt.mjs'],
  ['GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_SHA256', 'scripts/genesis001-admission-monitor-current-state.mjs'],
  ['GENESIS_001_SEALED_LAUNCH_ADOPTION_SOURCE_SHA256', 'scripts/genesis001-sealed-launch-adoption.mjs'],
  ['SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_SHA256', generator],
];
const finalization = 'async function completeBootstrapLaunch(input) { return input; }\n';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'warpkeep-source-pins-'));
  mkdirSync(join(root, 'scripts'));
  for (const [, path] of sourceNames) writeFileSync(join(root, path), `// ${path}\n`);
  writeFileSync(join(root, bootstrap), `// prefix\n${finalization}\nfunction packageNameAndVersion() {}\n`);
  writeFileSync(join(root, generator), pin('EXPECTED_BOOTSTRAP_SHA256') + '// unchanged generator\n');
  writeFileSync(join(root, verifier), sourceNames.map(([name]) => pin(name)).join('')
    + pin('GENESIS_001_POLICY_OBSERVATION_BOOTSTRAP_FINALIZATION_SHA256')
    + pin('GENESIS_001_FREEZE_PUBLISH_RECEIPT_SHA256'));
});
afterEach(() => rmSync(root, { recursive: true }));
it('hashes the updated generator after bootstrap derivation and preserves historical pins', () => {
  const original = readFileSync(join(root, verifier), 'utf8');
  const oldGenerator = readFileSync(join(root, generator), 'utf8');
  const result = derivePreparedSourcePins({ repositoryRoot: root });
  expect(result.files.map(file => file.path)).toEqual([generator, verifier]);
  const generated = Buffer.from(result.files[0].bytes).toString();
  expect(generated).toBe(oldGenerator.replace(stale, digest(readFileSync(join(root, bootstrap), 'utf8'))));
  const verified = Buffer.from(result.files[1].bytes).toString();
  let expected = original;
  for (const [name, path] of sourceNames) {
    const body = path === generator ? generated : readFileSync(join(root, path), 'utf8');
    expected = expected.replace(pin(name), pin(name).replace(stale, digest(body)));
  }
  expected = expected.replace(pin('GENESIS_001_POLICY_OBSERVATION_BOOTSTRAP_FINALIZATION_SHA256'),
    pin('GENESIS_001_POLICY_OBSERVATION_BOOTSTRAP_FINALIZATION_SHA256').replace(stale, digest(finalization)));
  expect(verified).toBe(expected);
  expect(readFileSync(join(root, verifier), 'utf8')).toBe(original);
  expect(readFileSync(join(root, generator), 'utf8')).toBe(oldGenerator);
  for (const file of result.files) writeFileSync(join(root, file.path), file.bytes);
  expect(derivePreparedSourcePins({ repositoryRoot: root })).toEqual(result);
});
it.each(['missing', 'duplicate', 'expression'])('rejects %s pin declarations without writes', kind => {
  const before = readFileSync(join(root, generator), 'utf8');
  let changed = before.replace(pin('EXPECTED_BOOTSTRAP_SHA256'), '');
  if (kind === 'duplicate') changed = before + pin('EXPECTED_BOOTSTRAP_SHA256');
  if (kind === 'expression') changed = before.replace(`'${stale}'`, 'callerDigest()');
  writeFileSync(join(root, generator), changed);
  expect(() => derivePreparedSourcePins({ repositoryRoot: root })).toThrow('LOCAL_PREPARED_SOURCE_PINS_INVALID');
  expect(readFileSync(join(root, generator), 'utf8')).toBe(changed);
});
it.each(['missing-start', 'duplicate-start', 'missing-end', 'end-before-start'])('rejects ambiguous finalization slice: %s', kind => {
  let body = readFileSync(join(root, bootstrap), 'utf8');
  if (kind === 'missing-start') body = body.replace('async function completeBootstrapLaunch(input)', 'async function renamed(input)');
  if (kind === 'duplicate-start') body += finalization;
  if (kind === 'missing-end') body = body.replace('function packageNameAndVersion(', 'function renamed(');
  if (kind === 'end-before-start') body = `\nfunction packageNameAndVersion() {}\n${finalization}`;
  writeFileSync(join(root, bootstrap), body);
  expect(() => derivePreparedSourcePins({ repositoryRoot: root })).toThrow('LOCAL_PREPARED_SOURCE_PINS_INVALID');
});
it('rejects caller hashes and accessor roots without invoking the accessor', () => {
  expect(() => derivePreparedSourcePins({ repositoryRoot: root, sha256: stale } as never)).toThrow('LOCAL_PREPARED_SOURCE_PINS_INVALID');
  let invoked = false;
  expect(() => derivePreparedSourcePins({ get repositoryRoot() { invoked = true; return root; } })).toThrow('LOCAL_PREPARED_SOURCE_PINS_INVALID');
  expect(invoked).toBe(false);
});
it.each(['invalid-utf8', 'oversize'])('rejects %s source bytes', kind => {
  writeFileSync(join(root, bootstrap), kind === 'invalid-utf8' ? Buffer.from([0xff]) : Buffer.alloc(4 * 1024 * 1024 + 1, 32));
  expect(() => derivePreparedSourcePins({ repositoryRoot: root })).toThrow('LOCAL_PREPARED_SOURCE_PINS_INVALID');
});
it('preserves CRLF while hashing the exact existing finalization projection', () => {
  for (const path of new Set([...sourceNames.map(([, path]) => path), verifier])) {
    writeFileSync(join(root, path), readFileSync(join(root, path), 'utf8').replaceAll('\n', '\r\n'));
  }
  const result = derivePreparedSourcePins({ repositoryRoot: root });
  for (const file of result.files) expect(Buffer.from(file.bytes).toString().replaceAll('\r\n', '')).not.toContain('\n');
  const body = Buffer.from(result.files[1].bytes).toString();
  // Existing verifier starts its end marker at LF, retaining the preceding CR.
  expect(body).toContain(digest(finalization.replaceAll('\n', '\r\n') + '\r'));
});
it.skipIf(process.platform === 'win32')('rejects a source symlink and preserves its target', () => {
  const target = join(root, 'target.mjs');
  const original = readFileSync(join(root, bootstrap));
  writeFileSync(target, original);
  unlinkSync(join(root, bootstrap));
  symlinkSync(target, join(root, bootstrap));
  expect(() => derivePreparedSourcePins({ repositoryRoot: root })).toThrow('LOCAL_PREPARED_SOURCE_PINS_INVALID');
  expect(readFileSync(target)).toEqual(original);
});
