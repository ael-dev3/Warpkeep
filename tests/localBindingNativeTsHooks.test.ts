import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');
const node = process.platform === 'win32'
  ? join(repositoryRoot, '.git', 'ci-node-22.22.3', 'node.exe')
  : process.execPath;
const fixture = join(repositoryRoot, 'tests', 'fixtures', 'localBindingNativeTsHooksFixture.mjs');
const roots: string[] = [];
const defaultImports = [
  { specifier: './value', target: 'value.ts' }, { specifier: 'yaml', yaml: true },
];

function write(root: string, relative: string, body: string) {
  const target = join(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body);
}

function makeFixture(
  entryBody: string,
  imports = defaultImports,
  nestedYaml = "module.exports = { suffix: '-yaml' }\n",
) {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-native-hooks-'));
  roots.push(root);
  write(root, 'source/entry.ts', entryBody);
  write(root, 'source/value.ts', 'export enum Tone { Low = 3 }\nexport class Box { constructor(public n: number) {} }\n');
  write(root, 'yaml/dist/index.js', "module.exports = require('./nested.js')\n");
  write(root, 'yaml/dist/nested.js', nestedYaml);
  for (const path of ['source', 'yaml', 'yaml/dist']) chmodSync(join(root, path), 0o700);
  write(root, 'graph.json', JSON.stringify([
    { path: 'entry.ts', format: 'typescript', imports },
    { path: 'value.ts', format: 'typescript', imports: [] },
  ]));
  write(root, 'yaml-files.json', JSON.stringify([
    { path: 'dist/index.js', mode: 420 }, { path: 'dist/nested.js', mode: 420 },
  ]));
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('native local binding TypeScript hooks', () => {
  it('runs transformed TypeScript and a contained nested physical YAML CJS graph in pinned Node', () => {
    const root = makeFixture(
      "import { Tone, Box } from './value';\nimport yaml from 'yaml';\nexport const value = new Box(Tone.Low).n + yaml.suffix;\n",
    );
    const result = spawnSync(node, [fixture, root], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ value: '3-yaml' });
  });

  it('admits only the YAML archive builtins used by the pinned physical CJS graph', () => {
    const allowedRoot = makeFixture(
      "import { Tone } from './value'; import yaml from 'yaml'; export const value = Tone.Low + yaml.suffix;\n",
      defaultImports,
      "module.exports = { suffix: '-' + require('process').platform + '-' + require('buffer').Buffer.from('yaml').toString() }\n",
    );
    const allowed = spawnSync(node, [fixture, allowedRoot], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    expect(allowed.status, allowed.stderr).toBe(0);
    expect(JSON.parse(allowed.stdout)).toEqual({ value: `3-${process.platform}-yaml` });

    const deniedRoot = makeFixture(
      "import yaml from 'yaml'; export const value = yaml.suffix;\n",
      [{ specifier: 'yaml', yaml: true }],
      "module.exports = { suffix: String(require('fs').existsSync('.')) }\n",
    );
    const denied = spawnSync(node, [fixture, deniedRoot], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    expect(denied.status).not.toBe(0);
    expect(denied.stderr).toContain('LOCAL_BINDING_HOOK_RESOLUTION_DENIED');

    const barePackageRoot = makeFixture(
      "import yaml from 'yaml'; export const value = yaml.suffix;\n",
      [{ specifier: 'yaml', yaml: true }],
      "module.exports = { suffix: require('unapproved-package') }\n",
    );
    write(barePackageRoot, 'node_modules/unapproved-package/index.js', "module.exports = '-ambient'\n");
    const barePackage = spawnSync(node, [fixture, barePackageRoot], {
      encoding: 'utf8', env: { PATH: process.env.PATH },
    });
    expect(barePackage.status).not.toBe(0);
    expect(barePackage.stderr).toContain('LOCAL_BINDING_HOOK_RESOLUTION_DENIED');

    for (const builtin of ['process', 'buffer']) {
      const repositoryRoot = makeFixture(
        `import value from '${builtin}'; export const result = value;\n`,
        [],
      );
      const repository = spawnSync(node, [fixture, repositoryRoot], {
        encoding: 'utf8', env: { PATH: process.env.PATH },
      });
      expect(repository.status).not.toBe(0);
      expect(repository.stderr).toContain('LOCAL_BINDING_HOOK_RESOLUTION_DENIED');

      const unrecordedRoot = makeFixture(
        "import { Tone } from './value'; import yaml from 'yaml'; export const value = Tone.Low + yaml.suffix;\n",
      );
      const unrecorded = spawnSync(node, [fixture, unrecordedRoot], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH, LOCAL_BINDING_FIXTURE_UNRECORDED_BUILTIN: builtin },
      });
      expect(unrecorded.status).not.toBe(0);
      expect(unrecorded.stderr).toContain('LOCAL_BINDING_HOOK_RESOLUTION_DENIED');
    }
  });

  it('denies dynamic imports and unrecorded extension fallback at the runtime boundary', () => {
    const dynamicRoot = makeFixture("export const value = await import('./value');\n", []);
    const dynamic = spawnSync(node, [fixture, dynamicRoot], { encoding: 'utf8' });
    expect(dynamic.status).not.toBe(0);
    expect(dynamic.stderr).toContain('LOCAL_BINDING_HOOK_RESOLUTION_DENIED');

    const fallbackRoot = makeFixture("import { Tone } from './value.ts'; export const value = Tone.Low;\n");
    const fallback = spawnSync(node, [fixture, fallbackRoot], { encoding: 'utf8' });
    expect(fallback.status).not.toBe(0);
    expect(fallback.stderr).toContain('LOCAL_BINDING_HOOK_RESOLUTION_DENIED');
  });

  it('rejects a source identity swap and an extra physical YAML file before evaluation', () => {
    const sourceRoot = makeFixture(
      "import { Tone } from './value'; import yaml from 'yaml'; export const value = Tone.Low + yaml.suffix;\n",
    );
    const sourceSwap = spawnSync(node, [fixture, sourceRoot], {
      encoding: 'utf8', env: { PATH: process.env.PATH, LOCAL_BINDING_FIXTURE_MUTATION: 'source-swap' },
    });
    expect(sourceSwap.status).not.toBe(0);
    expect(sourceSwap.stderr).toContain('LOCAL_BINDING_HOOK_FILE_CHANGED');

    const yamlRoot = makeFixture(
      "import { Tone } from './value'; import yaml from 'yaml'; export const value = Tone.Low + yaml.suffix;\n",
    );
    const yamlExtra = spawnSync(node, [fixture, yamlRoot], {
      encoding: 'utf8', env: { PATH: process.env.PATH, LOCAL_BINDING_FIXTURE_MUTATION: 'yaml-extra' },
    });
    expect(yamlExtra.status).not.toBe(0);
    expect(yamlExtra.stderr).toContain('LOCAL_BINDING_HOOK_YAML_INVALID');
  });
});
