import { createHash, randomBytes } from 'node:crypto';
import { closeSync, constants, existsSync, fchmodSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readdirSync, realpathSync, renameSync, statfsSync, writeSync } from 'node:fs';
import { isBuiltin, registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { derivePreparedClosureScannerArchiveFiles } from './local-prepared-closure-scanner-archive.mjs';
import { assertPreparedClosureScannerNamespace as attest } from './local-prepared-closure-scanner-namespace.mjs';

const ROOT = '/home/warpkeep/.warpkeep/release-preparation-v1';
const TOOLCHAIN = `${ROOT}/toolchain`;
const DESTINATION = `${TOOLCHAIN}/typescript-7.0.2-linux-x64`;
const CACHE = `${ROOT}/cache/closure-scanner`;
const NODE = `${TOOLCHAIN}/node-v22.22.3-linux-x64/bin/node`;
const NODE_SHA256 = 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2';
const PROFILE = 'warpkeep-prepared-closure-scanner-linux-x64-v1';
const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = `${REPOSITORY}/scripts/local-prepared-closure-scanner-v1.json`;
const POLICY_URL = pathToFileURL(`${REPOSITORY}/scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs`).href;
const ENTRIES = ['dist/ast/index.js', 'dist/api/fs.js', 'dist/api/sync/api.js'];
let active = false;
function fail() { throw new Error('LOCAL_PREPARED_CLOSURE_SCANNER_INVALID'); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function object(value, keys) {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail();
}
function directory(path) {
  const state = lstatSync(path);
  if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000
    || (state.mode & 0o7777) !== 0o700 || realpathSync(path) !== path
    || statfsSync(path).type !== 0xef53) fail();
}
function syncDirectory(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function createDirectory(path) { mkdirSync(path, { mode: 0o700 }); directory(path); syncDirectory(dirname(path)); }
function read(path, maximumBytes, expected = {}) {
  const result = readLocalBindingBoundedFile(path, { maximumBytes, minimumBytes: 1, expectedUid: 1000, ...expected });
  if ((BigInt(result.identity.mode) & 0o7000n) !== 0n) { result.body.fill(0); fail(); }
  return result.body;
}
function write(path, bytes, mode) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
  try {
    let at = 0;
    while (at < bytes.length) { const written = writeSync(fd, bytes, at, bytes.length - at); if (written < 1) fail(); at += written; }
    fchmodSync(fd, mode); fsyncSync(fd);
  } finally { closeSync(fd); }
  syncDirectory(dirname(path));
}
function parents(root, path) {
  let current = root;
  for (const part of path.split('/').slice(0, -1)) {
    current = `${current}/${part}`;
    if (!existsSync(current)) createDirectory(current); else directory(current);
  }
}
function configuration() {
  const bytes = read(MANIFEST, 256 * 1024);
  let lock;
  let packageBody;
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (!bytes.equals(Buffer.from(`${JSON.stringify(value, null, 2)}\n`))) fail();
    object(value, ['schemaVersion', 'profile', 'lockPath', 'packages']);
    if (value.schemaVersion !== 1 || value.profile !== PROFILE || value.lockPath !== 'services/auth-bridge/pnpm-lock.yaml'
      || !Array.isArray(value.packages) || value.packages.length !== 2) fail();
    lock = read(`${REPOSITORY}/${value.lockPath}`, 4 * 1024 * 1024);
    const lockText = new TextDecoder('utf8', { fatal: true }).decode(lock).replaceAll('\r\n', '\n');
    packageBody = read(`${REPOSITORY}/services/auth-bridge/package.json`, 64 * 1024);
    const servicePackage = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(packageBody));
    if (servicePackage.name !== '@warpkeep/auth-bridge' || servicePackage.devDependencies?.typescript !== '7.0.2'
      || !/^lockfileVersion: '9\.0'\n/u.test(lockText)
      || [...lockText.matchAll(/^      typescript:\n        specifier: 7\.0\.2\n        version: 7\.0\.2$/gm)].length !== 1) fail();
    const paths = new Set();
    const records = [];
    let total = 0;
    for (const [index, package_] of value.packages.entries()) {
      object(package_, ['name', 'version', 'packagePath', 'archiveFile', 'url', 'integrity', 'archiveBytes', 'files']);
      const name = index === 0 ? 'typescript' : '@typescript/typescript-linux-x64';
      const basename = name.split('/').at(-1);
      if (package_.name !== name || package_.version !== '7.0.2' || package_.packagePath !== name
        || package_.archiveFile !== `${basename}-7.0.2.tgz`
        || package_.url !== `https://registry.npmjs.org/${name}/-/${basename}-7.0.2.tgz`
        || !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(package_.integrity)
        || !Number.isSafeInteger(package_.archiveBytes) || package_.archiveBytes < 1 || package_.archiveBytes > 32 * 1024 * 1024
        || !Array.isArray(package_.files) || package_.files.length < 1 || package_.files.length > 1024) fail();
      const lockKey = index === 0 ? 'typescript@7.0.2' : "'@typescript/typescript-linux-x64@7.0.2'";
      const marker = `  ${lockKey}:\n    resolution: {integrity: ${package_.integrity}}\n`;
      if (lockText.split(marker).length !== 2) fail();
      let previous = '';
      for (const file of package_.files) {
        object(file, ['path', 'bytes', 'sha256', 'mode']);
        if (typeof file.path !== 'string' || file.path.length > 240 || !/^[A-Za-z0-9._/-]+$/u.test(file.path)
          || file.path.split('/').some(part => !part || part === '.' || part === '..') || file.path <= previous
          || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > 32 * 1024 * 1024
          || !/^[a-f0-9]{64}$/u.test(file.sha256)
          || file.mode !== (file.path === (index === 0 ? 'bin/tsc' : 'lib/tsc') ? 0o500 : 0o400)) fail();
        previous = file.path;
        const path = `${name}/${file.path}`;
        if (paths.has(path.toLowerCase())) fail();
        paths.add(path.toLowerCase()); total += file.bytes;
        records.push(Object.freeze({ ...file, path }));
      }
    }
    if (total > 64 * 1024 * 1024
      || !ENTRIES.every(path => paths.has(`typescript/${path}`))
      || !paths.has('@typescript/typescript-linux-x64/lib/tsc')
      || !paths.has('@typescript/typescript-linux-x64/package.json') || !paths.has('typescript/package.json')) fail();
    return { packages: value.packages, records, manifestSha256: sha(bytes), lockSha256: sha(lock), packageSha256: sha(packageBody) };
  } finally { bytes.fill(0); lock?.fill(0); packageBody?.fill(0); }
}
function materialize(config) {
  if (existsSync(DESTINATION)) {
    directory(DESTINATION);
    if (JSON.stringify(readdirSync(DESTINATION)) !== JSON.stringify(['node_modules'])) fail();
    attest(`${DESTINATION}/node_modules`, config.records); return;
  }
  directory(CACHE);
  const staging = `${TOOLCHAIN}/.typescript-7.0.2-linux-x64-${randomBytes(16).toString('hex')}`;
  createDirectory(staging); createDirectory(`${staging}/node_modules`);
  for (const package_ of config.packages) {
    const archive = read(`${CACHE}/${package_.archiveFile}`, package_.archiveBytes,
      { expectedMode: 0o400, expectedBytes: package_.archiveBytes });
    let files;
    try {
      files = derivePreparedClosureScannerArchiveFiles(archive, package_.integrity);
      if (files.length !== package_.files.length) fail();
      for (const [index, file] of files.entries()) {
        const expected = package_.files[index];
        if (file.path !== expected.path || file.bytes.length !== expected.bytes || sha(file.bytes) !== expected.sha256) fail();
      }
      for (const [index, file] of files.entries()) {
        const path = `${package_.packagePath}/${file.path}`;
        parents(`${staging}/node_modules`, path);
        write(`${staging}/node_modules/${path}`, file.bytes, package_.files[index].mode);
      }
    } finally { archive.fill(0); for (const file of files ?? []) file.bytes.fill(0); }
  }
  attest(`${staging}/node_modules`, config.records);
  if (existsSync(DESTINATION)) fail();
  renameSync(staging, DESTINATION); syncDirectory(TOOLCHAIN);
}

/** Fixed offline scanner bootstrap. Call before importing closure-family/policy.
 * Archives come only from the owner-private fixed cache. No npm installation,
 * caller dependency tree, arbitrary loader or source-byte override is accepted.
 */
export function installPreparedClosureScanner(...args) {
  // A rejected nested installation must not clear another active hook owner.
  if (active) fail();
  let hooks;
  try {
    if (args.length !== 0 || process.platform !== 'linux' || process.arch !== 'x64'
      || process.getuid?.() !== 1000 || process.version !== 'v22.22.3' || process.execPath !== NODE
      || process.execArgv.length !== 0 || process.env.NODE_OPTIONS || process.env.NODE_PATH) fail();
    for (const path of [ROOT, TOOLCHAIN]) directory(path);
    const node = read(NODE, 128 * 1024 * 1024, { expectedSha256: NODE_SHA256, expectedMode: 0o500, discardBody: true });
    node.fill(0);
    const config = configuration();
    materialize(config);
    const root = `${DESTINATION}/node_modules`;
    const rootUrl = pathToFileURL(`${root}/`).href;
    const recordByUrl = new Map(config.records.map(file => [pathToFileURL(`${root}/${file.path}`).href, file]));
    const mappings = new Map(ENTRIES.map(path => [`../services/auth-bridge/node_modules/typescript/${path}`,
      pathToFileURL(`${root}/typescript/${path}`).href]));
    let released = false;
    const assertUnchanged = () => {
      if (released) fail();
      const current = configuration();
      if (current.manifestSha256 !== config.manifestSha256 || current.lockSha256 !== config.lockSha256
        || current.packageSha256 !== config.packageSha256) fail();
      directory(DESTINATION);
      if (JSON.stringify(readdirSync(DESTINATION)) !== JSON.stringify(['node_modules'])) fail();
      attest(root, config.records);
    };
    assertUnchanged();
    hooks = registerHooks({
      resolve(specifier, context, next) {
        if (context.parentURL === POLICY_URL && mappings.has(specifier)) {
          return { url: mappings.get(specifier), shortCircuit: true };
        }
        if (context.parentURL === POLICY_URL && specifier.includes('node_modules/')) fail();
        const result = next(specifier, context);
        if (context.parentURL?.startsWith(rootUrl)
          && !isBuiltin(result.url) && !recordByUrl.has(result.url)) fail();
        return result;
      },
      load(url, context, next) {
        if (!url.startsWith(rootUrl)) return next(url, context);
        const record = recordByUrl.get(url);
        if (record === undefined || !/\.(?:js|cjs|json)$/u.test(record.path)) fail();
        const bytes = read(fileURLToPath(url), record.bytes, { expectedBytes: record.bytes, expectedSha256: record.sha256,
          expectedMode: record.mode });
        try {
          const source = new TextDecoder('utf8', { fatal: true }).decode(bytes);
          return { format: record.path.endsWith('.json') ? 'json' : record.path.endsWith('.cjs') ? 'commonjs' : 'module', source, shortCircuit: true };
        } finally { bytes.fill(0); }
      },
    });
    active = true;
    return Object.freeze({ profile: PROFILE, root, manifestSha256: config.manifestSha256, assertUnchanged,
      release() {
        if (released) fail();
        try { assertUnchanged(); }
        finally { released = true; hooks.deregister(); active = false; }
      } });
  } catch {
    hooks?.deregister(); active = false; fail();
  }
}
