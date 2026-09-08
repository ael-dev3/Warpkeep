// @vitest-environment node
import { closeSync, fstatSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runLocalBindingBoundedProcess } from '../scripts/local-binding-runtime-process.mjs';

it('inherits a separately opened descriptor4 while descriptor3 carries only public metadata', async () => {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-fd4-'));
  const path = join(root, 'synthetic-secret');
  writeFileSync(path, 'synthetic-test-only-credential', { mode: 0o600 });
  const fd = openSync(path, 'r');
  try {
    const result = await runLocalBindingBoundedProcess(process.execPath, ['--input-type=module', '-e',
      "import {readFileSync} from 'node:fs'; const control=JSON.parse(readFileSync(3,'utf8')); const secret=readFileSync(4); process.stdout.write(JSON.stringify({control,received:secret.length===30})); secret.fill(0);"], {
      cwd: root, env: {}, fd3: '{"source":"public"}', inheritedFd4: fd,
      timeout: 10000, maxOutput: 1024,
    });
    expect(result).toEqual({ stdout: '{"control":{"source":"public"},"received":true}', stderr: '' });
    expect(fstatSync(fd).isFile()).toBe(true);
  } finally { closeSync(fd); rmSync(root, { recursive: true, force: true }); }
});

it.each([-1, 0, 1, 2, 3.5, NaN, '4'])('rejects invalid inherited descriptor before launching: %s', async inheritedFd4 => {
  await expect(runLocalBindingBoundedProcess('must-not-launch', [], { cwd: process.cwd(), env: {},
    inheritedFd4, timeout: 1000, maxOutput: 1024 } as never))
    .rejects.toMatchObject({ code: 'LOCAL_BINDING_RUNTIME_PROCESS_DESCRIPTOR_INVALID' });
});
