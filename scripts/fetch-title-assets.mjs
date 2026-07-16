import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { fetchPinnedGithubReleaseAsset } from './fetch-pinned-github-asset.mjs';
import { readExactResponseBody } from './read-exact-response-body.mjs';
import { readWarpkeepPackageVersion } from './warpkeep-package-version.mjs';
import { writePinnedCacheFile } from './write-pinned-cache-file.mjs';

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
const url = `https://github.com/${release.repository}/releases/download/${release.tag}/${release.attachment}`;
const productVersion = readWarpkeepPackageVersion();

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const response = await fetchPinnedGithubReleaseAsset(url, {
  headers: { 'user-agent': `Warpkeep-asset-fetch/${productVersion}` },
  signal: AbortSignal.timeout(60_000)
});
if (!response.ok) {
  await response.body?.cancel().catch(() => undefined);
  throw new Error(`Asset download failed with HTTP ${response.status}.`);
}
const bytes = await readExactResponseBody(response, release.bytes, 'Asset archive');
const hash = sha256(bytes);
if (hash !== release.sha256) throw new Error(`Asset archive hash changed: ${hash}.`);
writePinnedCacheFile({ destination, bytes, mode: 0o600, label: 'Title asset archive cache' });
console.log(`${release.tag}/${release.attachment}`);
console.log(`${release.bytes} bytes, sha256 ${release.sha256}`);
console.log(`cached at ${destination}`);
