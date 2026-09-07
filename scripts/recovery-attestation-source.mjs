import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseRecoveryBindingV2 } from './recovery-activation-candidate.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';

const BINDING = 'config/releases/0.4.0-sealed-launch.json';
const FILES = [BINDING, 'package-lock.json', 'package.json'];
const fail = () => { throw new Error('RECOVERY_ATTESTATION_SOURCE_INVALID'); };
const hex = value => /^[0-9a-f]{40}$/u.test(value);

/** Local committed-source consistency, not protected-main or receipt authentication. */
export function readRecoveryAttestationSource(repositoryRoot) {
  if (typeof repositoryRoot !== 'string' || resolve(repositoryRoot) !== repositoryRoot
      || realpathSync(repositoryRoot) !== repositoryRoot) fail();
  // Do not inherit caller Git object replacements, alternate indexes or config.
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0' };
  function git(args) {
    const result = spawnSync('git', ['--no-pager', '-c', 'core.fsmonitor=false', ...args], {
      cwd: repositoryRoot, env, encoding: 'buffer', timeout: 10000, maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    if (result.error || result.status !== 0) fail();
    return result.stdout;
  }
  const line = args => new TextDecoder('utf-8', { fatal: true }).decode(git(args)).trimEnd();
  if (realpathSync(line(['rev-parse', '--show-toplevel'])) !== repositoryRoot) fail();
  const candidateCommit = line(['rev-parse', '--verify', 'HEAD^{commit}']);
  const candidateTree = line(['rev-parse', '--verify', 'HEAD^{tree}']);
  if (!hex(candidateCommit) || !hex(candidateTree)) fail();
  // An assume-unchanged or skip-worktree index must not hide dirty source.
  const indexed = git(['ls-files', '-v', '-z']).toString('utf8').split('\0');
  if (indexed.pop() !== '' || indexed.some(entry => !entry.startsWith('H '))) fail();
  if (git(['diff', '--no-ext-diff', '--no-textconv', '--name-only', 'HEAD', '--']).length !== 0) fail();
  const bindingBytes = git(['show', `${candidateCommit}:${BINDING}`]);
  const binding = parseRecoveryBindingV2(new TextDecoder('utf-8', { fatal: true }).decode(bindingBytes));
  const parents = line(['rev-list', '--parents', '-n', '1', candidateCommit]).split(' ');
  if (parents.length !== 2 || parents[0] !== candidateCommit || parents[1] !== binding.preparationSourceCommit) fail();
  const parent = parents[1];
  if (line(['rev-parse', `${parent}^{tree}`]) !== binding.preparationSourceTree) fail();
  const delta = line(['diff-tree', '--no-commit-id', '--name-status', '--no-renames', '-r', parent, candidateCommit]);
  if (delta !== FILES.map(path => `M\t${path}`).join('\n')) fail();
  for (const path of FILES) {
    for (const commit of [parent, candidateCommit]) {
      const entry = line(['ls-tree', commit, '--', path]);
      const parts = entry.split('\t');
      if (parts.length !== 2 || parts[1] !== path || !/^100644 blob [0-9a-f]{40}$/u.test(parts[0])) fail();
    }
    const full = join(repositoryRoot, path);
    if (realpathSync(full) !== full) fail();
    const opened = readLocalBindingBoundedFile(full, { maximumBytes: 2 * 1024 * 1024 });
    try { if (!opened.body.equals(git(['show', `${candidateCommit}:${path}`]))) fail(); }
    finally { opened.body.fill(0); }
  }
  for (const path of ['package.json', 'package-lock.json']) {
    const documents = [parent, candidateCommit].map(commit => {
      const source = new TextDecoder('utf-8', { fatal: true }).decode(git(['show', `${commit}:${path}`]));
      const value = JSON.parse(source);
      if (!value || Array.isArray(value) || typeof value !== 'object'
          || `${JSON.stringify(value, null, 2)}\n` !== source || value.name !== 'warpkeep') fail();
      return { source, value };
    });
    const [before, after] = documents;
    if (before.value.version !== '0.3.43' || after.value.version !== '0.4.0') fail();
    after.value.version = '0.3.43';
    if (path === 'package-lock.json') {
      for (const [document, version] of [[before, '0.3.43'], [after, '0.4.0']]) {
        if (document.value.lockfileVersion !== 3 || document.value.requires !== true
            || document.value.packages?.['']?.name !== 'warpkeep'
            || document.value.packages[''].version !== version) fail();
      }
      after.value.packages[''].version = '0.3.43';
    }
    if (`${JSON.stringify(after.value, null, 2)}\n` !== before.source) fail();
  }
  if (line(['rev-parse', 'HEAD']) !== candidateCommit
      || git(['diff', '--no-ext-diff', '--no-textconv', '--name-only', 'HEAD', '--']).length !== 0) fail();
  return Object.freeze({ candidateCommit, candidateTree,
    recoveryAuthorizationCoreSha256: binding.recoveryAuthorizationCoreSha256,
    sourceClosureProfile: binding.sourceClosureProfile, sourceClosureSha256: binding.sourceClosureSha256 });
}
