import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { fetchPinnedGithubReleaseAsset } from './fetch-pinned-github-asset.mjs';
import { readExactResponseBody } from './read-exact-response-body.mjs';
import { readWarpkeepPackageVersion } from './warpkeep-package-version.mjs';
import { writePinnedCacheFile } from './write-pinned-cache-file.mjs';

const root = resolve(import.meta.dirname, '..');
const release = Object.freeze({
  repository: 'ael-dev3/Warpkeep-Assets',
  tag: 'hegemony-supply-wagon-3d-2026-07-14',
  attachment: 'hegemony-supply-wagon-3d-sources-v1.zip',
  bytes: 6_068_830,
  sha256: '7abc2ed243286a970c9e2cc1fb589bf4e2c275e94b5ddcb4d51e9a5645e118e5'
});
const destination = process.env.WARPKEEP_WAGON_ARCHIVE_CACHE
  ? resolve(process.env.WARPKEEP_WAGON_ARCHIVE_CACHE)
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
const bytes = await readExactResponseBody(response, release.bytes, 'Hegemony supply-wagon source archive');
const hash = sha256(bytes);
if (hash !== release.sha256) {
  throw new Error(`Hegemony supply-wagon source archive hash changed: ${hash}.`);
}
writePinnedCacheFile({
  destination,
  bytes,
  mode: 0o600,
  label: 'Hegemony supply-wagon source archive cache'
});
console.log(`${release.tag}/${release.attachment}`);
console.log(`${release.bytes} bytes, sha256 ${release.sha256}`);
console.log(`cached at ${destination}`);
