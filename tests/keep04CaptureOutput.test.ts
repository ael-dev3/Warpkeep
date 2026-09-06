// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { readFile, realpath, rmdir, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createKeep04CaptureRun, createKeep04WindowsProfile, writeKeep04RunFile } from '../scripts/qa-observer/keep04-capture-output.mjs';

const created: { path: string; parent: string; file?: string }[] = [];
afterEach(async () => {
  for (const entry of created.splice(0)) {
    const canonical = await realpath(entry.path); const parent = await realpath(entry.parent);
    if (!canonical.toLowerCase().startsWith(`${parent.toLowerCase()}\\`) && !canonical.startsWith(`${parent}/`)) throw new Error('Test cleanup escaped owned parent');
    if (entry.file) await unlink(join(canonical, entry.file));
    await rmdir(canonical); // Empty owned test directories only; no recursive deletion.
  }
});
it('selects distinct fresh runs and refuses overwrite or caller-forged destinations', async () => {
  const first = await createKeep04CaptureRun(); const second = await createKeep04CaptureRun();
  created.push(...[first, second].map(run => ({ path: run.directory, parent: resolve('artifacts/keep04-qa') })));
  expect(first.directory).not.toBe(second.directory); expect(Object.isFrozen(first)).toBe(true);
  await writeKeep04RunFile(first, 'run-provenance.json', '{"testOnly":true}'); created[0].file = 'run-provenance.json';
  await expect(writeKeep04RunFile(first, 'run-provenance.json', 'overwrite')).rejects.toMatchObject({ code: 'EEXIST' });
  expect(await readFile(join(first.directory, 'run-provenance.json'), 'utf8')).toBe('{"testOnly":true}');
  await expect(writeKeep04RunFile({ ...first }, 'run-provenance.json', 'forged')).rejects.toThrow(/Invalid owned/);
  await expect(writeKeep04RunFile(second, '../escape.json', '{}')).rejects.toThrow(/Invalid owned/);
  await expect(writeKeep04RunFile(second, 'synthetic-render-observations.json', new Uint8Array(4 * 1024 * 1024 + 1))).rejects.toThrow(/bound/);
});
it('creates unique fresh profiles separately from capture outputs', async () => {
  const first = await createKeep04WindowsProfile(); const second = await createKeep04WindowsProfile();
  created.push(...[first, second].map(path => ({ path, parent: resolve('.cache/keep04-qa') })));
  expect(first).not.toBe(second); expect(first.replaceAll('\\', '/')).toMatch(/\/\.cache\/keep04-qa\/profile-/);
});
