import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { derivePreparedPtrLinuxBindings } from '../../scripts/local-binding-runtime.mjs';

// Run with the pinned Linux Node, no execArgv, and a credential-free environment.
// This exercises compilation and generation, not provider publication or install.
const root = fileURLToPath(new URL('../../', import.meta.url));
function git(args) {
  const result = spawnSync('/usr/bin/git', args, {
    cwd: root, env: process.env, shell: false, timeout: 10_000,
    maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(result.status, 0, 'fixture Git inspection must succeed');
  return result.stdout;
}
function configurationDigest() {
  const bytes = git(['config', '--local', '--null', '--list']);
  try { return createHash('sha256').update(bytes).digest('hex'); }
  finally { bytes.fill(0); }
}
const configBefore = configurationDigest();
const commit = git(['rev-parse', '--verify', 'HEAD']).toString('utf8').trim();
const tree = git(['rev-parse', '--verify', 'HEAD^{tree}']).toString('utf8').trim();
let result;
try {
  result = await derivePreparedPtrLinuxBindings();
  assert.equal(result.sourceCommit, commit);
  assert.equal(result.sourceTree, tree);
  assert.ok(result.bindings.some(entry => entry.path.endsWith('/index.ts')));
  assert.ok(result.bindings.some(entry => /gameplay/i.test(entry.path)),
    'real PTR gameplay bindings must be generated');
  assert.equal(configurationDigest(), configBefore, 'caller Git config must not change');
  process.stdout.write(`${JSON.stringify({
    sourceCommit: commit, sourceTree: tree, fileCount: result.bindings.length,
    gameplayFiles: result.bindings.filter(entry => /gameplay/i.test(entry.path))
      .map(entry => entry.path),
    callerConfigurationUnchanged: true,
  })}\n`);
} finally {
  for (const entry of result?.bindings ?? []) entry.bytes.fill(0);
  assert.equal(configurationDigest(), configBefore, 'caller Git config must not change on failure');
}
