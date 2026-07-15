import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { fetchPinnedGithubReleaseAsset } from './fetch-pinned-github-asset.mjs';
import { readExactResponseBody } from './read-exact-response-body.mjs';

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
const temporary = `${destination}.${process.pid}.tmp`;
const url = `https://github.com/${release.repository}/releases/download/${release.tag}/${release.attachment}`;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
try {
  const response = await fetchPinnedGithubReleaseAsset(url, {
    headers: { 'user-agent': 'Warpkeep-asset-fetch/0.3.3' },
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`Asset download failed with HTTP ${response.status}.`);
  const bytes = await readExactResponseBody(response, release.bytes, 'Asset archive');
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
