export function createAssetToolEnvironment(homeDirectory: string): Readonly<{
  HOME: string;
  TMPDIR: string;
  PATH: '/usr/bin:/bin';
  LANG: 'C';
  LC_ALL: 'C';
}>;
