import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const limit = 5 * 1024 * 1024;
const allowedRuntimeAssets = new Set([
  'public/audio/warpkeep-title-theme-a.mp3',
  'public/audio/warpkeep-title-theme-b.mp3',
  'public/audio/warpkeep-menu-theme.mp3',
  'public/audio/warpkeep-lowlands-theme.mp3',
  'public/video/warpkeep-menu-loop-v2.mp4'
]);
const result = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'buffer' });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error('Unable to enumerate tracked files.');
const tracked = result.stdout.toString('utf8').split('\0').filter(Boolean);
const violations = tracked.flatMap((path) => {
  const details = statSync(resolve(root, path), { throwIfNoEntry: false });
  return details && details.size > limit && !allowedRuntimeAssets.has(path)
    ? [`${details.size}\t${path}`]
    : [];
});
if (violations.length > 0) {
  throw new Error(`Tracked non-runtime files exceed 5 MiB:\n${violations.join('\n')}`);
}
console.log(`Tracked file-size policy passed; ${allowedRuntimeAssets.size} large runtime assets are allowlisted.`);
