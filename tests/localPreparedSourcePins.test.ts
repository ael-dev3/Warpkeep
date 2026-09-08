// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { derivePreparedSourcePins } from '../scripts/local-prepared-source-pins.mjs';

const generator = 'scripts/generate-0.4.0-sealed-launch-activation.mjs';
const verifier = 'scripts/verify-0.4.0-sealed-launch.mjs';
const bootstrap = 'scripts/greater-realm-production-bootstrap.mjs';
const generatorTest = 'tests/sealedLaunchActivationGenerator.test.ts';
const stale = 'a'.repeat(64);
const pin = (name: string) => `const ${name} =\n  '${stale}';\n`;
const testAuthority = `const TEST_PREPARATION_BOOTSTRAP_AUTHORITY: Readonly<{\n  preparationSourceCommit: string;\n  moduleTreeId: string;\n  bootstrapBlob: string;\n  bootstrapSha256: string;\n}> = Object.freeze({\n  preparationSourceCommit: PREPARATION_COMMIT,\n  moduleTreeId: '1'.repeat(40),\n  bootstrapBlob: '2'.repeat(40),\n  bootstrapSha256:\n    '${stale}',\n});\n`;
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
const inlineSources: readonly [string, string, number][] = [
  ['genesis002ContractSource', 'spacetimedb/genesis002/src/contract.ts', 1],
  ['genesis002AdminPolicySource', 'spacetimedb/genesis002/src/adminPolicy.ts', 1],
  ['genesis002AuthSource', 'spacetimedb/genesis002/src/auth.ts', 1],
  ['genesis002LifecycleSource', 'spacetimedb/genesis002/src/lifecycle.ts', 1],
  ['genesis002AtlasImportSource', 'spacetimedb/genesis002/src/atlasImportReducers.ts', 1],
  ['authBridgeConfigSource', 'services/auth-bridge/src/config.ts', 1],
  ['authBridgeJwtSource', 'services/auth-bridge/src/jwt.ts', 2],
  ['authBridgeSource', 'services/auth-bridge/src/app.ts', 2],
  ['genesis002PublisherCoreSource', 'scripts/genesis002-production-publisher.mjs', 1],
  ['genesis002TransportSource', 'scripts/genesis002-production-transport.ts', 1],
  ['authBridgeTypesSource', 'services/auth-bridge/src/types.ts', 1],
  ['ptrOwnerPolicySource', 'spacetimedb/ptr/src/ownerPolicy.ts', 1],
  ['ptrAuthSource', 'spacetimedb/ptr/src/auth.ts', 1],
  ['ptrAtlasImportReducersSource', 'spacetimedb/ptr/src/atlasImportReducers.ts', 1],
  ['ptrOwnerReducersSource', 'spacetimedb/ptr/src/ownerReducers.ts', 1],
  ['ptrProductionAdminTokenSource', 'scripts/ptr-production-admin-token.ts', 1],
  ['ptrProductionTransportSource', 'scripts/ptr-production-transport.ts', 1],
  ['ptrProductionImportCoreSource', 'scripts/ptr-production-import-core.ts', 1],
  ['ptrProductionReleaseReceiptsSource', 'scripts/ptr-production-release-receipts.ts', 1],
  ['ptrProductionImportOperatorSource', 'scripts/ptr-production-import-operator.ts', 1],
  ['ptrProductionReceiptFileSource', 'scripts/ptr-production-receipt-file.ts', 1],
  ['ptrOwnerProvisionOperatorSource', 'scripts/ptr-owner-provision-operator.ts', 1],
  ['ptrPublisherCoreSource', 'scripts/ptr-production-publisher.mjs', 1],
  ['ptrPublisherCliSource', 'scripts/ptr-production-publisher-cli.ts', 1],
];
const inlinePin = (key: string) => `    [sources.${key},\n      '${stale}'],\n`;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'warpkeep-source-pins-'));
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'warpkeep', version: '0.3.43', private: true, description: '0.3.43' }, null, 2)}\n`);
  writeFileSync(join(root, 'package-lock.json'), `${JSON.stringify({ name: 'warpkeep', version: '0.3.43', lockfileVersion: 3, packages: { '': { name: 'warpkeep', version: '0.3.43' }, 'node_modules/example': { version: '0.3.43' } } }, null, 2)}\n`);
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'tests'));
  writeFileSync(join(root, generatorTest), `${testAuthority}// historical receipt ${stale}\n`);
  for (const [, path] of inlineSources) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), `// ${path}\n`);
  }
  for (const [, path] of sourceNames) writeFileSync(join(root, path), `// ${path}\n`);
  writeFileSync(join(root, bootstrap), `// prefix\n${finalization}\nfunction packageNameAndVersion() {}\n`);
  writeFileSync(join(root, generator), pin('EXPECTED_BOOTSTRAP_SHA256') + '// unchanged generator\n');
  writeFileSync(join(root, verifier), sourceNames.map(([name]) => pin(name)).join('')
    + pin('GENESIS_001_POLICY_OBSERVATION_BOOTSTRAP_FINALIZATION_SHA256')
    + pin('GENESIS_001_FREEZE_PUBLISH_RECEIPT_SHA256')
    + pin('SEALED_LAUNCH_PACKAGE_STRUCTURE_SHA256')
    + pin('SEALED_LAUNCH_LOCK_STRUCTURE_SHA256')
    + inlineSources.map(([key, , count]) => inlinePin(key).repeat(count)).join(''));
});
afterEach(() => rmSync(root, { recursive: true }));
it('hashes the updated generator after bootstrap derivation and preserves historical pins', () => {
  const original = readFileSync(join(root, verifier), 'utf8');
  const oldGenerator = readFileSync(join(root, generator), 'utf8');
  const result = derivePreparedSourcePins({ repositoryRoot: root });
  expect(result.files.map(file => file.path)).toEqual([generator, verifier, generatorTest]);
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
  for (const [key, path] of inlineSources) {
    expected = expected.replaceAll(inlinePin(key), inlinePin(key).replace(stale, digest(readFileSync(join(root, path), 'utf8'))));
  }
  for (const [name, value] of [
    ['SEALED_LAUNCH_PACKAGE_STRUCTURE_SHA256', { name: 'warpkeep', version: '<release-version>', private: true, description: '0.3.43' }],
    ['SEALED_LAUNCH_LOCK_STRUCTURE_SHA256', { name: 'warpkeep', version: '<release-version>', lockfileVersion: 3, packages: { '': { name: 'warpkeep', version: '<release-version>' }, 'node_modules/example': { version: '0.3.43' } } }],
  ] as const) {
    const projected = `${JSON.stringify(value, null, 2)}\n`;
    expected = expected.replace(pin(name), pin(name).replace(stale, digest(projected)));
  }
  expect(verified).toBe(expected);
  expect(Buffer.from(result.files[2].bytes).toString()).toBe(
    `${testAuthority.replace(stale, digest(readFileSync(join(root, bootstrap), 'utf8')))}// historical receipt ${stale}\n`,
  );
  expect(readFileSync(join(root, generatorTest), 'utf8')).toBe(`${testAuthority}// historical receipt ${stale}\n`);
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
  for (const path of new Set([...sourceNames.map(([, path]) => path), verifier, generatorTest])) {
    writeFileSync(join(root, path), readFileSync(join(root, path), 'utf8').replaceAll('\n', '\r\n'));
  }
  const result = derivePreparedSourcePins({ repositoryRoot: root });
  for (const file of result.files) expect(Buffer.from(file.bytes).toString().replaceAll('\r\n', '')).not.toContain('\n');
  const body = Buffer.from(result.files[1].bytes).toString();
  // Existing verifier starts its end marker at LF, retaining the preceding CR.
  expect(body).toContain(digest(finalization.replaceAll('\n', '\r\n') + '\r'));
});
it.each(['missing', 'duplicate', 'expression', 'changed-authority'])('rejects a %s bootstrap test pin without emitting a partial family', kind => {
  let body = testAuthority;
  if (kind === 'missing') body = '// missing fixture';
  if (kind === 'duplicate') body += testAuthority;
  if (kind === 'expression') body = body.replace(`'${stale}'`, 'callerDigest()');
  if (kind === 'changed-authority') body = body.replace("'1'.repeat(40)", "'3'.repeat(40)");
  writeFileSync(join(root, generatorTest), body);
  const before = readFileSync(join(root, generator));
  expect(() => derivePreparedSourcePins({ repositoryRoot: root })).toThrow('LOCAL_PREPARED_SOURCE_PINS_INVALID');
  expect(readFileSync(join(root, generatorTest), 'utf8')).toBe(body);
  expect(readFileSync(join(root, generator))).toEqual(before);
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
it.each(['missing', 'extra', 'unknown', 'expression'])('rejects %s inline hash slots', kind => {
  const before = readFileSync(join(root, verifier), 'utf8');
  let changed = before.replace(inlinePin('authBridgeJwtSource'), '');
  if (kind === 'extra') changed = before + inlinePin('authBridgeJwtSource');
  if (kind === 'unknown') changed = before + inlinePin('callerControlledSource');
  if (kind === 'expression') changed = before.replace(inlinePin('ptrAuthSource'), inlinePin('ptrAuthSource').replace(`'${stale}'`, 'callerDigest()'));
  writeFileSync(join(root, verifier), changed);
  expect(() => derivePreparedSourcePins({ repositoryRoot: root })).toThrow('LOCAL_PREPARED_SOURCE_PINS_INVALID');
  expect(readFileSync(join(root, verifier), 'utf8')).toBe(changed);
});
it.each(['noncanonical', 'wrong-name', 'mixed-version', 'wrong-lock-version'])('rejects %s package identity before deriving structure pins', kind => {
  const path = join(root, 'package-lock.json');
  let value = readFileSync(path, 'utf8');
  if (kind === 'noncanonical') value = value.trim();
  if (kind === 'wrong-name') value = value.replace('"warpkeep"', '"other"');
  if (kind === 'mixed-version') value = value.replace('"0.3.43"', '"0.4.0"');
  if (kind === 'wrong-lock-version') value = value.replace('"lockfileVersion": 3', '"lockfileVersion": 2');
  writeFileSync(path, value);
  expect(() => derivePreparedSourcePins({ repositoryRoot: root })).toThrow('LOCAL_PREPARED_SOURCE_PINS_INVALID');
  expect(readFileSync(path, 'utf8')).toBe(value);
});
