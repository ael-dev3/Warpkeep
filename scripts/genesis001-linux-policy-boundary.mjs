import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, readSync, readdirSync, realpathSync, rmdirSync, unlinkSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';

export const G001_POLICY_HOME = posix.join('/', 'home', 'warpkeep');
export const G001_POLICY_NODE = posix.join(G001_POLICY_HOME, '.warpkeep', 'release-preparation-v1',
  'toolchain', 'node-v22.22.3-linux-x64', 'bin', 'node');
export const G001_POLICY_NODE_SHA = 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2';
export const G001_POLICY_ROOT = posix.join(G001_POLICY_HOME, '.warpkeep', 'private',
  'production-admin-v1', 'g001-policy-observation');
export const G001_POLICY_OPERATOR = 'scripts/genesis001-policy-observation-receipt.mjs';
const GIT = posix.join('/', 'usr', 'bin', 'git');
const GIT_SHA = '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668';
const NULL_PATH = posix.join('/', 'dev', 'null');
export const G001_POLICY_ENV = Object.freeze({ PATH: `${posix.join('/', 'usr', 'bin')}:${posix.join('/', 'bin')}`, HOME: G001_POLICY_HOME,
  LANG: 'C', LC_ALL: 'C', TZ: 'UTC', GIT_CONFIG_GLOBAL: NULL_PATH, GIT_CONFIG_SYSTEM: NULL_PATH,
  GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_GRAFT_FILE: NULL_PATH, GIT_TERMINAL_PROMPT: '0' });
export const policyDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export function policyFail() { throw Error('G001_LINUX_POLICY_NATIVE_FAILED'); }
export function readPolicyRequest() {
  const buffer = Buffer.alloc(8193);
  let count = 0;
  try {
    for (;;) {
      const size = readSync(3, buffer, count, buffer.length - count, null);
      if (size === 0) break;
      count += size; if (count > 8192) policyFail();
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, count));
    const value = JSON.parse(text);
    if (JSON.stringify(value) !== text) policyFail();
    return value;
  } finally { buffer.fill(0); closeSync(3); }
}
export function policyDirectory(path, mode = 0o700) {
  const status = lstatSync(path, { bigint: true });
  if (!status.isDirectory() || status.isSymbolicLink() || realpathSync(path) !== path
    || status.uid !== 1000n || status.gid !== 1000n || (status.mode & 0o7777n) !== BigInt(mode)) policyFail();
  return Object.fromEntries(['dev', 'ino', 'mode', 'uid', 'gid'].map(key => [key, String(status[key])]));
}
export function policyPrivateAncestors(path) {
  if (path !== G001_POLICY_HOME && !path.startsWith(`${G001_POLICY_HOME}/`)) policyFail();
  let current = path;
  for (;;) {
    policyDirectory(current, current === G001_POLICY_HOME ? 0o750 : 0o700);
    if (current === G001_POLICY_HOME) break;
    current = dirname(current);
  }
}
export function attestPolicyHost(expected, worker = false) {
  const account = userInfo();
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.version !== 'v22.22.3'
    || process.execPath !== G001_POLICY_NODE || process.getuid?.() !== 1000 || process.geteuid?.() !== 1000
    || process.getgid?.() !== 1000 || process.getegid?.() !== 1000
    || account.username !== 'warpkeep' || account.homedir !== G001_POLICY_HOME || account.uid !== 1000 || account.gid !== 1000
    || JSON.stringify(process.execArgv) !== JSON.stringify(worker ? ['--experimental-vm-modules'] : [])
    || Object.keys(process.env).some(key => /^(?:NODE_|ESBUILD_|TS_NODE_|BUN_|LD_|DYLD_|BASH_ENV$|ENV$|OPENSSL_CONF$|SSL_CERT_|PYTHONPATH$|VITEST$)/u.test(key))) policyFail();
  policyDirectory(G001_POLICY_HOME, 0o750);
  policyPrivateAncestors(dirname(G001_POLICY_NODE));
  const node = readLocalBindingBoundedFile(G001_POLICY_NODE, { maximumBytes: 124819136,
    expectedBytes: 124819136, expectedSha256: G001_POLICY_NODE_SHA, expectedUid: 1000,
    expectedMode: 0o500, requireExecutable: true, rejectWritableExecutable: true,
    expectedIdentity: expected?.node, discardBody: true });
  if (lstatSync(G001_POLICY_NODE).gid !== 1000 || lstatSync(GIT).gid !== 0) policyFail();
  const git = readLocalBindingBoundedFile(GIT, { maximumBytes: 16 * 1024 * 1024,
    expectedSha256: GIT_SHA, expectedUid: 0, expectedMode: 0o755,
    requireExecutable: true, rejectWritableExecutable: true, expectedIdentity: expected?.git, discardBody: true });
  return Object.freeze({ node: node.identity, git: git.identity });
}
export function policyGit(root, args, buffer = false) {
  const value = execFileSync(GIT, ['--no-replace-objects', '--no-optional-locks',
    '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', `core.hooksPath=${NULL_PATH}`, ...args],
  { cwd: root, env: G001_POLICY_ENV, timeout: 60000, maxBuffer: 32 * 1024 * 1024,
    encoding: buffer ? 'buffer' : 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return buffer ? value : value.trimEnd();
}
export function attestPolicySource(expected, root = process.cwd()) {
  if (root !== resolve(root) || realpathSync(root) !== root
    || policyGit(root, ['rev-parse', '--show-toplevel']) !== root
    || !['https://github.com/ael-dev3/Warpkeep', 'https://github.com/ael-dev3/Warpkeep.git']
      .includes(policyGit(root, ['remote', 'get-url', 'origin']))
    || policyGit(root, ['status', '--porcelain=v1', '--untracked-files=all']) !== ''
    || policyGit(root, ['ls-files', '-v']).split('\n').some(line => !line.startsWith('H '))) policyFail();
  const commit = policyGit(root, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const tree = policyGit(root, ['rev-parse', '--verify', 'HEAD^{tree}']);
  if (!/^[a-f0-9]{40}$/u.test(commit) || !/^[a-f0-9]{40}$/u.test(tree)
    || policyGit(root, ['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}']) !== commit) policyFail();
  const operatorBlob = policyGit(root, ['rev-parse', `${commit}:${G001_POLICY_OPERATOR}`]);
  if (!/^[a-f0-9]{40}$/u.test(operatorBlob)) policyFail();
  const operator = policyGit(root, ['show', `${commit}:${G001_POLICY_OPERATOR}`], true);
  const operatorSha256 = policyDigest(operator);
  try {
    readLocalBindingBoundedFile(join(root, G001_POLICY_OPERATOR), { maximumBytes: 1024 * 1024,
      expectedBytes: operator.length, expectedSha256: operatorSha256, expectedUid: 1000 }).body.fill(0);
  } finally { operator.fill(0); }
  const source = Object.freeze({ sourceCommit: commit, sourceTree: tree, operatorBlob, operatorSha256 });
  if (expected !== undefined && JSON.stringify(source) !== JSON.stringify(expected)) policyFail();
  return source;
}
export function policyOwnedRun(path, runId) {
  if (!/^[a-f0-9]{32}$/u.test(runId) || path !== join(G001_POLICY_ROOT, 'runs', runId)) policyFail();
  policyPrivateAncestors(path);
}
/** Captures actual owned bytes and identities; never follows symlinks during cleanup. */
export function policyInventory(root) {
  const files = [], directories = [];
  function walk(path) {
    const identity = policyDirectory(path);
    const name = relative(root, path).split(sep).join('/');
    directories.push({ path: name, ...identity });
    for (const child of readdirSync(path).sort()) {
      const absolute = join(path, child), status = lstatSync(absolute);
      if (status.isDirectory() && !status.isSymbolicLink()) walk(absolute);
      else {
        if (!status.isFile() || status.isSymbolicLink() || status.uid !== 1000 || status.gid !== 1000
          || status.nlink !== 1 || (status.mode & 0o7777) !== 0o600) policyFail();
        const opened = readLocalBindingBoundedFile(absolute, { maximumBytes: 16 * 1024 * 1024,
          expectedUid: 1000, expectedMode: 0o600 });
        try { files.push({ path: relative(root, absolute).split(sep).join('/'),
          bytes: opened.body.length, sha256: policyDigest(opened.body), identity: opened.identity }); }
        finally { opened.body.fill(0); }
      }
    }
    if (JSON.stringify(policyDirectory(path)) !== JSON.stringify(identity)) policyFail();
  }
  walk(root);
  return { files, directories };
}
export function cleanupPolicyRun(root, runId) {
  policyOwnedRun(root, runId);
  const snapshot = policyInventory(root);
  const digest = policyDigest(Buffer.from(JSON.stringify(snapshot)));
  if (JSON.stringify(policyInventory(root)) !== JSON.stringify(snapshot)) policyFail();
  for (const item of snapshot.files) {
    readLocalBindingBoundedFile(join(root, item.path), { maximumBytes: 16 * 1024 * 1024,
      expectedBytes: item.bytes, expectedSha256: item.sha256, expectedIdentity: item.identity,
      expectedUid: 1000, expectedMode: 0o600 }).body.fill(0);
    unlinkSync(join(root, item.path));
  }
  for (const item of [...snapshot.directories].reverse()) {
    const path = join(root, item.path);
    if (JSON.stringify(policyDirectory(path)) !== JSON.stringify({ dev: item.dev, ino: item.ino,
      mode: item.mode, uid: item.uid, gid: item.gid })) policyFail();
    rmdirSync(path);
  }
  return Object.freeze({ outcome: 'cleaned', runId, namespaceInventorySha256: digest });
}
