import { lstatSync, readdirSync, realpathSync, statfsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';

function fail() { throw new Error('LOCAL_PREPARED_CLOSURE_SCANNER_NAMESPACE_INVALID'); }
function directory(path, device) {
  const state = lstatSync(path, { bigint: true });
  if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000n
    || (state.mode & 0o7777n) !== 0o700n || realpathSync(path) !== path
    || state.dev !== device || statfsSync(path).type !== 0xef53) fail();
  return state;
}

/** Read-only namespace comparison. The fixed scanner bootstrap independently
 * selects and authenticates the root and expected records; data is not a grant.
 */
export function assertPreparedClosureScannerNamespace(root, records) {
  try {
    if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000
      || typeof root !== 'string' || !isAbsolute(root) || !Array.isArray(records)
      || records.length < 1 || records.length > 2048) fail();
    const expected = new Map();
    const expectedDirectories = new Set();
    const aliases = new Set();
    let total = 0;
    for (const file of records) {
      if (typeof file?.path !== 'string' || file.path.length > 320 || !/^[A-Za-z0-9@._/-]+$/u.test(file.path)
        || file.path.split('/').some(part => !part || part === '.' || part === '..')
        || aliases.has(file.path.toLowerCase()) || !Number.isSafeInteger(file.bytes)
        || file.bytes < 1 || file.bytes > 32 * 1024 * 1024 || ![0o400, 0o500].includes(file.mode)
        || !/^[a-f0-9]{64}$/u.test(file.sha256)) fail();
      aliases.add(file.path.toLowerCase()); expected.set(file.path, file); total += file.bytes;
      if (total > 64 * 1024 * 1024) fail();
      const parts = file.path.split('/');
      for (let index = 1; index < parts.length; index++) expectedDirectories.add(parts.slice(0, index).join('/'));
    }
    const device = lstatSync(root, { bigint: true }).dev;
    function inventory() {
      const directories = new Map();
      const found = new Set();
      function visit(path, prefix) {
        directories.set(prefix, directory(path, device));
        if (directories.size > 4096) fail();
        for (const child of readdirSync(path, { withFileTypes: true })) {
          const relative = `${prefix}${child.name}`;
          if (child.isDirectory()) {
            if (!expectedDirectories.has(relative)) fail();
            visit(`${path}/${child.name}`, `${relative}/`);
          } else {
            if (!child.isFile() || child.isSymbolicLink() || !expected.has(relative) || found.has(relative)) fail();
            found.add(relative);
          }
        }
      }
      visit(root, '');
      if (found.size !== expected.size) fail();
      return directories;
    }
    const directories = inventory();
    const identities = new Map();
    for (const [path, record] of expected) {
      const opened = readLocalBindingBoundedFile(`${root}/${path}`, { maximumBytes: record.bytes,
        minimumBytes: 1, expectedUid: 1000, expectedMode: record.mode, expectedBytes: record.bytes,
        expectedSha256: record.sha256, discardBody: true });
      if ((BigInt(opened.identity.mode) & 0o7777n) !== BigInt(record.mode)) fail();
      identities.set(path, opened.identity);
    }
    const afterDirectories = inventory();
    if (afterDirectories.size !== directories.size) fail();
    for (const [path, before] of directories) {
      const after = afterDirectories.get(path);
      if (!after || ['dev', 'ino', 'uid', 'mode', 'mtimeNs', 'ctimeNs'].some(key => before[key] !== after[key])) fail();
    }
    for (const [path, before] of identities) {
      const after = lstatSync(`${root}/${path}`, { bigint: true });
      if (!after.isFile() || after.isSymbolicLink() || Object.keys(before).some(key => String(after[key]) !== before[key])) fail();
    }
  } catch { fail(); }
}
