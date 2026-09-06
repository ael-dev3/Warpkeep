import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');
const generator = join(repositoryRoot, 'scripts', 'generate-local-binding-yaml-manifest.py');
const archive = join(repositoryRoot, '.git', 'yaml-2.9.0.tgz');
const manifestPath = join(repositoryRoot, 'scripts', 'local-binding-runtime-yaml-v1.json');
const boundaryHarness = join(repositoryRoot, 'tests', 'fixtures', 'local_binding_yaml_generator_test.py');
const temporaryRoots: string[] = [];

function python(): string {
  return process.platform === 'win32' ? 'python' : '/usr/bin/python3';
}

function run(script: string, argument: string) {
  return spawnSync(python(), [script, argument], { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
}

function generatorFixture() {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-yaml-generator-'));
  temporaryRoots.push(root);
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, '.git'));
  const script = join(root, 'scripts', 'generate-local-binding-yaml-manifest.py');
  const manifest = join(root, 'scripts', 'local-binding-runtime-yaml-v1.json');
  writeFileSync(script, readFileSync(generator));
  writeFileSync(manifest, readFileSync(manifestPath));
  writeFileSync(join(root, '.git', 'yaml-2.9.0.tgz'), readFileSync(archive));
  return { script, manifest };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('local binding YAML authority manifest', () => {
  it('checks the committed manifest against the exact offline archive', () => {
    const fixture = generatorFixture();
    const result = run(fixture.script, '--check');
    expect(result.status, result.stderr).toBe(0);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      profile: 'warpkeep-local-binding-yaml-v1',
      name: 'yaml',
      version: '2.9.0',
      sri: 'sha512-2AvhNX3mb8zd6Zy7INTtSpl1F15HW6Wnqj0srWlkKLcpYl/gMIMJiyuGq2KeI2YFxUPjdlB+3Lc10seMLtL4cA==',
      entry: 'dist/index.js',
    });
    expect(manifest.files.length).toBeGreaterThan(20);
    expect(manifest.files.map((entry: { path: string }) => entry.path)).toEqual(
      [...manifest.files.map((entry: { path: string }) => entry.path)].sort(),
    );
    expect(manifest.digest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('accepts exactly --write or --check', () => {
    const fixture = generatorFixture();
    const before = readFileSync(manifestPath);
    expect(run(fixture.script, '').status).not.toBe(0);
    expect(run(fixture.script, '--write').status).toBe(0);
    expect(readFileSync(fixture.manifest)).toEqual(before);
    expect(readFileSync(manifestPath)).toEqual(before);
    expect(spawnSync(python(), [fixture.script, '--check', '--write'], { timeout: 10000, maxBuffer: 1024 * 1024 }).status).not.toBe(0);
  });

  it('fails closed before TAR parsing when archive identity changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-yaml-generator-'));
    temporaryRoots.push(root);
    const copiedGenerator = join(root, 'scripts', 'generate-local-binding-yaml-manifest.py');
    const copiedArchive = join(root, '.git', 'yaml-2.9.0.tgz');
    mkdirSync(dirname(copiedGenerator), { recursive: true });
    mkdirSync(dirname(copiedArchive), { recursive: true });
    writeFileSync(copiedGenerator, readFileSync(generator));
    const changed = Buffer.from(readFileSync(archive));
    changed[0] ^= 0xff;
    writeFileSync(copiedArchive, changed);
    const result = run(copiedGenerator, '--check');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('LOCAL_BINDING_YAML_ARCHIVE_INVALID');
    expect(createHash('sha256').update(changed).digest('hex')).not.toBe(
      '008fa204cb1ba700e0272ba045abbf09a6ffe63456e8146ba97cac6c2ad1ef91',
    );
  });

  it('rejects traversal, links and wrong package metadata after exact archive attestation', () => {
    const result = spawnSync(python(), [boundaryHarness, generator], { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Ran 3 tests');
  });
});
