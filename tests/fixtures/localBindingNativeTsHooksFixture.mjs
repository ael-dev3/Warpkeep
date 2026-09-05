import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { installLocalBindingNativeTsHooks } from '../../scripts/local-binding-native-ts-hooks.mjs';

const root = resolve(process.argv[2]);
const sha256 = body => createHash('sha256').update(body).digest('hex');
const moduleRecords = JSON.parse(readFileSync(resolve(root, 'graph.json'), 'utf8'))
  .map(record => {
    const path = resolve(root, 'source', record.path);
    const body = readFileSync(path);
    const state = lstatSync(path, { bigint: true });
    const identity = Object.fromEntries(
      ['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].map(key => [key, String(state[key])]),
    );
    return { ...record, bytes: body.length, sha256: sha256(body), identity };
  });
const yamlFiles = JSON.parse(readFileSync(resolve(root, 'yaml-files.json'), 'utf8'))
  .map(record => {
    const body = readFileSync(resolve(root, 'yaml', record.path));
    return { ...record, bytes: body.length, sha256: sha256(body) };
  });

if (process.env.LOCAL_BINDING_FIXTURE_MUTATION === 'source-swap') {
  const entry = resolve(root, 'source', 'entry.ts');
  const replacement = `${entry}.replacement`;
  writeFileSync(replacement, readFileSync(entry));
  renameSync(replacement, entry);
}
if (process.env.LOCAL_BINDING_FIXTURE_MUTATION === 'yaml-extra') {
  writeFileSync(resolve(root, 'yaml', 'dist', 'extra.js'), 'module.exports = 1\n');
}

const hooks = installLocalBindingNativeTsHooks(
  { root: resolve(root, 'source'), entry: 'entry.ts', modules: moduleRecords },
  { root: resolve(root, 'yaml'), entry: 'dist/index.js', files: yamlFiles },
);
try {
  if (process.env.LOCAL_BINDING_FIXTURE_UNRECORDED_BUILTIN === 'process') await import('process');
  if (process.env.LOCAL_BINDING_FIXTURE_UNRECORDED_BUILTIN === 'buffer') await import('buffer');
  const loaded = await import('warpkeep:ptr-binding-entry');
  process.stdout.write(`${JSON.stringify({ value: loaded.value })}\n`);
} finally {
  hooks.deregister();
}
