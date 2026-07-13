import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const release = Object.freeze({
  repository: 'ael-dev3/Warpkeep-Assets',
  tag: 'title-stone-letters-2026-07-12',
  attachment: 'warpkeep-title-assemblies-v1.zip',
  bytes: 5_994_957,
  sha256: '492af33d4b0ff5ab80f2e726b68c2f8d497cd75bbcc036f57f2388e0b4089177'
});
const destination = process.env.WARPKEEP_TITLE_ARCHIVE_CACHE
  ? resolve(process.env.WARPKEEP_TITLE_ARCHIVE_CACHE)
  : resolve(root, '.cache/warpkeep-assets', release.tag, release.attachment);
const temporary = `${destination}.${process.pid}.tmp`;
const url = `https://github.com/${release.repository}/releases/download/${release.tag}/${release.attachment}`;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
try {
  const response = await fetch(url, {
    headers: { 'user-agent': 'Warpkeep-asset-fetch/0.3.0' },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`Asset download failed with HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength !== release.bytes) {
    throw new Error(`Asset archive byte length changed: ${bytes.byteLength}.`);
  }
  const hash = sha256(bytes);
  if (hash !== release.sha256) throw new Error(`Asset archive hash changed: ${hash}.`);
  writeFileSync(temporary, bytes, { mode: 0o600 });
  renameSync(temporary, destination);
  chmodSync(destination, 0o600);
  if (statSync(destination).size !== release.bytes) throw new Error('Cached archive write was incomplete.');
  console.log(`${release.tag}/${release.attachment}`);
  console.log(`${release.bytes} bytes, sha256 ${release.sha256}`);
  console.log(`cached at ${destination}`);
} finally {
  rmSync(temporary, { force: true });
}
