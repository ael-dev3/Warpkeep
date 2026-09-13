// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS as members,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH as manifestPath,
  deriveAuthBridgeNotificationPreparedDeployClosure } from '../scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
import { AUTH_BRIDGE_RELEASE_TRANSITION_FIXTURE_PATHS, canonicalAuthBridgeReleaseTransitionFixtureSource } from './helpers/authBridgeReleaseTransitionFixture';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import { recoveryG002PtrAdoptionCandidate } from './fixtures/recoveryG002PtrAdoptionCandidate';
import { recoveryBindingKeys } from '../scripts/recovery-binding-projection.mjs';
import { createRecoveryActivationBindingFromCandidate } from '../scripts/recovery-activation-candidate.mjs';

const bindingPath = 'config/releases/0.4.0-sealed-launch.json';
const verifierPath = 'scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
const encode = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
let temporary: string, root: string, preparation: string, preparationTree: string, hostShim: string;
let originalManifest: Buffer;
const git = (...args: string[]) => {
  try { return execFileSync('git', ['--no-replace-objects', '-c', 'core.autocrlf=false',
  '-c', 'core.fsmonitor=false', '-c', 'commit.gpgSign=false', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0',
  '-c', 'advice.graftFileDeprecated=false', ...args],
  { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
      GIT_GRAFT_FILE: process.platform === 'win32' ? 'NUL' : '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0' } }).trimEnd(); }
  catch (cause) { throw new Error(`Fixture Git failed: ${args.join(' ')}`, { cause }); }
};
function write(path: string, bytes: string | Uint8Array) {
  mkdirSync(dirname(join(root, path)), { recursive: true, mode: 0o700 });
  writeFileSync(join(root, path), bytes, { mode: 0o600 });
}
function commit() {
  git('add', '--all');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Synthetic closure source');
}
function amend() {
  git('add', '--all');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--amend', '--no-edit', '--quiet');
}
function preload(source: string) {
  const path = join(temporary, 'preload.mjs');
  writeFileSync(path, source);
  return path;
}
function invoke(preload?: string) {
  return spawnSync(process.execPath, [
    ...(process.platform === 'win32' ? ['--import', pathToFileURL(hostShim).href] : []),
    ...(preload ? ['--import', pathToFileURL(preload).href] : []), join(root, verifierPath),
  ], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, LANG: 'C', LC_ALL: 'C', TZ: 'UTC' } });
}
function activation(version: 2 | 3 | 4 | 5) {
  git('checkout', '--quiet', '--detach', '--force', preparation);
  const values: Record<string, string | number | boolean | null> = { ...recoveryBindingCandidate(),
    schemaVersion: version,
    profile: version === 2 ? 'warpkeep-0.4.0-sealed-launch-v2' : version === 3 ? 'warpkeep-0.4.0-sealed-launch-ptr-update-v3'
      : version === 4 ? 'warpkeep-0.4.0-sealed-launch-ptr-adoption-v4' : 'warpkeep-0.4.0-sealed-launch-g002-ptr-adoption-v5',
    ptrExistingUpdateReceiptDigest: '9'.repeat(64), ptrExistingUpdateReceiptCommitment: null,
    ptrExistingStateAdoptionReceiptDigest: '8'.repeat(64), ptrExistingStateAdoptionReceiptCommitment: null,
    ptrSealed: true, ptrPopulationGuardPassed: true, ptrSingletonOwnerCount: 1, ptrGeneralAdmissionCount: 0,
    ptrExpectedSealedStateHmacSha256: '7'.repeat(64), ptrExpectedOwnerInvariantHmacSha256: '6'.repeat(64),
    ...(version === 5 ? recoveryG002PtrAdoptionCandidate() : {}),
    preparationSourceCommit: preparation, preparationSourceTree: preparationTree,
    g001PolicySourceCommit: preparation, authBridgeSourceCommit: preparation,
  };
  const candidate = Object.fromEntries(recoveryBindingKeys(version).map(key => [key, values[key]]));
  write(bindingPath, encode(createRecoveryActivationBindingFromCandidate(encode(candidate))));
  for (const path of ['package.json', 'package-lock.json']) {
    const value = JSON.parse(readFileSync(join(root, path), 'utf8'));
    value.version = '0.4.0';
    if (path === 'package-lock.json') value.packages[''].version = '0.4.0';
    write(path, encode(value));
  }
  commit();
}
beforeAll(() => {
  temporary = mkdtempSync(join(tmpdir(), 'warpkeep-recovery-closure-'));
  root = join(temporary, 'repo'); mkdirSync(root, { mode: 0o700 });
  hostShim = join(temporary, 'windows-metadata-only.mjs');
  // Windows lacks Unix uid/mode semantics. Only those metadata fields are
  // modeled here; actual source bytes, imports, Git and CLI execution stay real.
  // On native Unix the same cases run without this shim.
  writeFileSync(hostShim, `import fs from 'node:fs';\nimport { syncBuiltinESMExports } from 'node:module';\nObject.defineProperty(process,'getuid',{value:()=>0});\nfor(const key of ['lstatSync','fstatSync']){const original=fs[key];fs[key]=(...args)=>{const s=original(...args);s.uid=typeof s.uid==='bigint'?0n:0;s.mode=typeof s.mode==='bigint'?s.mode&~0o022n:s.mode&~0o022;return s;};}\nsyncBuiltinESMExports();\n`);
  const bodies = new Map(members.map(path => {
    const bytes = readFileSync(resolve(path));
    return [path, AUTH_BRIDGE_RELEASE_TRANSITION_FIXTURE_PATHS.has(path)
      ? Buffer.from(canonicalAuthBridgeReleaseTransitionFixtureSource(path, bytes.toString('utf8'))) : bytes] as const;
  }));
  const derived = deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: bodies });
  for (const file of derived.workflowBodies) bodies.set(file.path, Buffer.from(file.bytes));
  for (const [path, bytes] of bodies) write(path, bytes);
  originalManifest = Buffer.from(derived.manifestBytes); write(manifestPath, originalManifest);
  git('init', '--quiet'); commit(); preparation = git('rev-parse', 'HEAD'); preparationTree = git('rev-parse', 'HEAD^{tree}');
}, 180000);
afterAll(() => { if (temporary) rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

it('keeps the exact V1 preparation manifest accepted by the actual closure CLI', () => {
  git('checkout', '--quiet', '--detach', '--force', preparation);
  const result = invoke();
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
});
it.each([2, 3, 4, 5] as const)('verifies real V%i S→A through the actual Pages closure CLI with unchanged S manifest', version => {
  activation(version);
  const result = invoke();
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
  expect(result.stdout).toContain('members verified');
  expect(readFileSync(join(root, manifestPath))).toEqual(originalManifest);
}, 30000);

it('isolates the actual Linux preflight ordinary bounded-helper cache before verifying recovery', () => {
  activation(5);
  const result = invoke(preload(`await import(${JSON.stringify(pathToFileURL(join(root, 'scripts/local-binding-bounded-file.mjs')).href)});\n`));
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
}, 30000);

it('reuses only its owned isolated graph on repeated closure verification', () => {
  activation(5);
  const result = invoke(preload(`const {verifyAuthBridgeNotificationPreparedDeployClosure: verify} = await import(${JSON.stringify(pathToFileURL(join(root, verifierPath)).href)});\nverify();\nverify();\n`));
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
}, 30000);

it.each(['entry', 'transitive'] as const)('rejects a previously injected isolated %s cache', kind => {
  activation(5);
  const name = kind === 'entry' ? 'recovery-attestation-source.mjs' : 'recovery-binding-projection.mjs';
  const virtualUrl = pathToFileURL(join(root, 'scripts/.warpkeep-prepared-recovery-reader-v1', name)).href;
  const source = kind === 'entry' ? "export function readRecoveryPreparedClosureSource(){throw new Error('unowned cache executed');}\n"
    : readFileSync(join(root, 'scripts', name), 'utf8');
  const result = invoke(preload(`import {registerHooks} from 'node:module';\nconst target=${JSON.stringify(virtualUrl)};\nconst hook=registerHooks({resolve(s,c,next){return s===target?{url:target,format:'module',shortCircuit:true}:next(s,c)},load(u,c,next){return u===target?{format:'module',source:${JSON.stringify(source)},shortCircuit:true}:next(u,c)}});\nawait import(target);\nhook.deregister();\n`));
  expect(result.status).toBe(1);
  expect(result.stderr).toBe('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MODULE_NOT_LOADED\n');
}, 30000);

it.each(['dirty-helper', 'dirty-helper-and-manifest'] as const)('rejects %s before evaluating substituted code', kind => {
  activation(5);
  const helperPath = 'scripts/recovery-attestation-source.mjs';
  const marker = join(temporary, 'substituted-helper-ran');
  const changed = `${readFileSync(join(root, helperPath), 'utf8')}\nimport {writeFileSync as injectedWrite} from 'node:fs';\ninjectedWrite(${JSON.stringify(marker)}, 'bad');\n`;
  write(helperPath, changed);
  if (kind === 'dirty-helper-and-manifest') {
    const manifest = JSON.parse(originalManifest.toString('utf8'));
    manifest.members.find((member: {path: string}) => member.path === helperPath).sha256 = createHash('sha256').update(changed).digest('hex');
    write(manifestPath, encode(manifest));
  }
  const result = invoke();
  expect(result.status).toBe(1);
  expect(result.stderr).toBe(kind === 'dirty-helper' ? 'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_DIGEST_MISMATCH\n'
    : 'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RECOVERY_SOURCE_INVALID\n');
  expect(existsSync(marker)).toBe(false);
}, 30000);

it.each(['mixed-profile', 'wrong-core', 'extra-package-change'] as const)('rejects a committed recovery %s', kind => {
  activation(5);
  const path = kind === 'extra-package-change' ? 'package.json' : bindingPath;
  const value = JSON.parse(readFileSync(join(root, path), 'utf8'));
  if (kind === 'mixed-profile') value.profile = 'warpkeep-0.4.0-sealed-launch-ptr-adoption-v4';
  if (kind === 'wrong-core') value.recoveryAuthorizationCoreSha256 = '0'.repeat(64);
  if (kind === 'extra-package-change') value.description = 'Unreviewed activation source';
  write(path, encode(value)); amend();
  const result = invoke();
  expect(result.status).toBe(1);
  expect(result.stderr).toBe('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RECOVERY_SOURCE_INVALID\n');
}, 30000);
