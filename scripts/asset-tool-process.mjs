import { resolve } from 'node:path';

export function createAssetToolEnvironment(homeDirectory) {
  const home = resolve(homeDirectory);
  return Object.freeze({
    HOME: home,
    TMPDIR: home,
    PATH: '/usr/bin:/bin',
    LANG: 'C',
    LC_ALL: 'C'
  });
}
