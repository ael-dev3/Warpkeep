import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { fetchPinnedGithubReleaseAsset } from './fetch-pinned-github-asset.mjs';
import { readExactResponseBody } from './read-exact-response-body.mjs';
import { readWarpkeepPackageVersion } from './warpkeep-package-version.mjs';
import { writePinnedCacheFile } from './write-pinned-cache-file.mjs';

const root = resolve(import.meta.dirname, '..');
const release = Object.freeze({
  repository: 'ael-dev3/Warpkeep-Assets',
  tag: 'hegemony-frontier-keep-3d-2026-07-14',
  attachment: 'hegemony-frontier-keep-3d-sources-v1.zip',
  bytes: 10_672_929,
  sha256: 'c029a636ee0a791ca54072d5f32fcf68263677951fd59c338dfe242264335d5f'
});
const destination = process.env.WARPKEEP_CASTLE_ARCHIVE_CACHE
  ? resolve(process.env.WARPKEEP_CASTLE_ARCHIVE_CACHE)
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
writePinnedCacheFile({ destination, bytes, mode: 0o600, label: 'Castle source archive cache' });
console.log(`${release.tag}/${release.attachment}`);
console.log(`${release.bytes} bytes, sha256 ${release.sha256}`);
console.log(`cached at ${destination}`);
