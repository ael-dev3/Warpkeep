// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const tsx = resolve('node_modules/tsx/dist/cli.mjs');
const generator = 'scripts/generate-keep04-voxel-dressing.ts';
const output = 'src/components/keep04/keep04DressingPlans.generated.ts';
const inputs = [generator, 'src/components/keep04/planKeep04DressingSource.ts',
  'src/components/keep04/keep04VisualProfile.ts', 'src/components/realm/voxelSurfaceMesh.ts'];
const fixtures: string[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    if (dirname(await realpath(fixture)) !== await realpath('.cache')) throw new Error('Fixture cleanup escaped its owned parent');
    for (const file of [...inputs, output]) await unlink(resolve(fixture, file)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    for (const directory of ['src/components/keep04', 'src/components/realm', 'src/components', 'src', 'scripts', '']) await rmdir(resolve(fixture, directory));
  }
});
async function isolatedFixture() {
  await mkdir('.cache', { recursive: true });
  const fixture = await mkdtemp(resolve('.cache/keep04-plan-fixture-')); fixtures.push(fixture);
  for (const file of [...inputs, output]) {
    await mkdir(dirname(resolve(fixture, file)), { recursive: true });
    await copyFile(file, resolve(fixture, file));
  }
  return fixture;
}
function run(fixture: string, args = ['--check']) {
  return spawnSync(process.execPath, [tsx, resolve(fixture, generator), ...args], { cwd: fixture, encoding: 'utf8' });
}
it('checks the checked-in static plans using the genuine generator', () => {
  const result = spawnSync(process.execPath, [tsx, generator, '--check'], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('Keep04 voxel dressing plans are current');
});

it('is deterministic in isolated fixtures and rejects altered or missing output without repairing it', async () => {
  const fixture = await isolatedFixture();
  expect(run(fixture).status).toBe(0);
  const expected = await readFile(resolve(fixture, output), 'utf8');
  const altered = expected + '\n// isolated output alteration\n';
  await writeFile(resolve(fixture, output), altered);
  const stale = run(fixture); expect(stale.status).toBe(1); expect(stale.stderr).toContain('missing or stale');
  expect(await readFile(resolve(fixture, output), 'utf8')).toBe(altered);
  await unlink(resolve(fixture, output));
  const missing = run(fixture); expect(missing.status).toBe(1); expect(missing.stderr).toContain('missing or stale');
  await expect(readFile(resolve(fixture, output))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(run(fixture, []).status).toBe(0);
  expect(await readFile(resolve(fixture, output), 'utf8')).toBe(expected.replace(/\r\n/g, '\n'));
  expect(run(fixture).status).toBe(0);
});

it.each(inputs.slice(1))('rejects %s source drift even when the old generated geometry is unchanged', async input => {
  const fixture = await isolatedFixture();
  const previous = await readFile(resolve(fixture, output), 'utf8');
  await writeFile(resolve(fixture, input), await readFile(resolve(fixture, input), 'utf8') + '\n// isolated source drift\n');
  const stale = run(fixture); expect(stale.status).toBe(1); expect(stale.stderr).toContain('missing or stale');
  expect(run(fixture, []).status).toBe(0); expect(run(fixture).status).toBe(0);
  expect(await readFile(resolve(fixture, output), 'utf8')).not.toBe(previous);
});

it('gates normal builds with the genuine stale-plan check before any output step', async () => {
  const build = JSON.parse(await readFile('package.json', 'utf8')).scripts.build as string;
  const gate = build.split(' && ')[0].split(' ');
  expect(gate).toEqual(['tsx', generator, '--check']);
  const fixture = await isolatedFixture();
  await unlink(resolve(fixture, output));
  // Execute the registered first build step, not a duplicate check implementation.
  const result = spawnSync(process.execPath, [tsx, ...gate.slice(1)], { cwd: fixture, encoding: 'utf8' });
  expect(result.status).toBe(1); expect(result.stderr).toContain('missing or stale');
});
