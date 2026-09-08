import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { derivePreparedClosureScannerArchiveFiles } from './local-prepared-closure-scanner-archive.mjs';

const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = '/home/warpkeep/.warpkeep/release-preparation-v1/cache/closure-scanner';
function fail() { throw new Error('LOCAL_PREPARED_CLOSURE_SCANNER_MANIFEST_INVALID'); }

/** Reproducible source inventory derivation, never runtime authority or install.
 * Run with no arguments to print JSON for review. Archive integrity comes from
 * the committed service lock, and all file hashes come from authenticated bytes.
 */
export function derivePreparedClosureScannerManifest(...args) {
  let lock;
  let packageBody;
  try {
    if (args.length !== 0 || process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000) fail();
    lock = readLocalBindingBoundedFile(`${REPOSITORY}/services/auth-bridge/pnpm-lock.yaml`,
      { maximumBytes: 4 * 1024 * 1024, minimumBytes: 1, expectedUid: 1000 }).body;
    packageBody = readLocalBindingBoundedFile(`${REPOSITORY}/services/auth-bridge/package.json`,
      { maximumBytes: 64 * 1024, minimumBytes: 1, expectedUid: 1000 }).body;
    const servicePackage = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(packageBody));
    const source = new TextDecoder('utf8', { fatal: true }).decode(lock).replaceAll('\r\n', '\n');
    if (servicePackage.name !== '@warpkeep/auth-bridge' || servicePackage.devDependencies?.typescript !== '7.0.2'
      || [...source.matchAll(/^      typescript:\n        specifier: 7\.0\.2\n        version: 7\.0\.2$/gm)].length !== 1) fail();
    const packages = [];
    for (const name of ['typescript', '@typescript/typescript-linux-x64']) {
      const key = name.startsWith('@') ? `'${name}@7.0.2'` : `${name}@7.0.2`;
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = [...source.matchAll(new RegExp(`^  ${escaped}:\\n    resolution: \\{integrity: (sha512-[A-Za-z0-9+/]{86}==)\\}\\n`, 'gm'))];
      if (matches.length !== 1) fail();
      const integrity = matches[0][1];
      const basename = name.split('/').at(-1);
      const archiveFile = `${basename}-7.0.2.tgz`;
      const archive = readLocalBindingBoundedFile(`${CACHE}/${archiveFile}`,
        { maximumBytes: 32 * 1024 * 1024, minimumBytes: 1, expectedUid: 1000, expectedMode: 0o400 }).body;
      let members;
      try {
        members = derivePreparedClosureScannerArchiveFiles(archive, integrity);
        const files = members.map(file => ({ path: file.path, bytes: file.bytes.length,
          sha256: createHash('sha256').update(file.bytes).digest('hex'),
          mode: file.path === (name === 'typescript' ? 'bin/tsc' : 'lib/tsc') ? 0o500 : 0o400 }));
        packages.push({name, version: '7.0.2', packagePath: name, archiveFile,
          url: `https://registry.npmjs.org/${name}/-/${basename}-7.0.2.tgz`, integrity, archiveBytes: archive.length, files});
      } finally { archive.fill(0); for (const member of members ?? []) member.bytes.fill(0); }
    }
    return Buffer.from(`${JSON.stringify({schemaVersion: 1, profile: 'warpkeep-prepared-closure-scanner-linux-x64-v1',
      lockPath: 'services/auth-bridge/pnpm-lock.yaml', packages}, null, 2)}\n`);
  } catch { fail(); }
  finally { lock?.fill(0); packageBody?.fill(0); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 2) fail();
  const bytes = derivePreparedClosureScannerManifest();
  try { process.stdout.write(bytes); } finally { bytes.fill(0); }
}
