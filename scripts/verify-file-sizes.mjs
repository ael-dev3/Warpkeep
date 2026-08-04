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
const exactOversizedRuntimeAssets = new Map([
  [
    'public/models/hegemony/inner-keep/landmarks/inner-keep-grand-covenant-cathedral-high-9bf438bdf020d274.glb',
    12_507_408
  ],
  [
    'public/models/hegemony/inner-keep/landmarks/inner-keep-grand-covenant-cathedral-balanced-c90cf49f6b90325b.glb',
    5_810_260
  ]
]);
const result = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'buffer' });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error('Unable to enumerate tracked files.');
const tracked = result.stdout.toString('utf8').split('\0').filter(Boolean);
const violations = tracked.flatMap((path) => {
  const details = statSync(resolve(root, path), { throwIfNoEntry: false });
  if (!details || details.size <= limit || allowedRuntimeAssets.has(path)) return [];
  const exactAllowedBytes = exactOversizedRuntimeAssets.get(path);
  return exactAllowedBytes === details.size ? [] : [`${details.size}\t${path}`];
});
if (violations.length > 0) {
  throw new Error(`Tracked non-runtime files exceed 5 MiB:\n${violations.join('\n')}`);
}
console.log(
  'Tracked file-size policy passed; '
  + `${allowedRuntimeAssets.size} legacy runtime assets and `
  + `${exactOversizedRuntimeAssets.size} exact Inner Keep assets are allowlisted.`
);
