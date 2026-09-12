// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, chownSync, copyFileSync, existsSync, lchownSync, lstatSync, mkdirSync, mkdtempSync,
  readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSealedRealmsProductionLinuxOperation, runSealedRealmsProductionLinuxPreflight } from '../scripts/sealed-realms-production-linux-preflight.mjs';
import { deriveSealedRealmOperationBundleSourceClosureDigest } from '../scripts/sealed-realms-production-bundle-engine.mjs';

const root = process.cwd();
const entry = join(root, 'scripts/sealed-realms-production-linux-preflight.mjs');
const donor = process.env.WARPKEEP_PREFLIGHT_PREPARED_FIXTURE;
const observationServicePaths = [
  'services/release-recovery/src/config.ts',
  'services/release-recovery/src/crypto.ts',
  'services/release-recovery/src/http.ts',
  'services/release-recovery/src/protocol.ts',
  'services/release-recovery/src/ptrObservation.ts',
  'services/release-recovery/src/recoveryPublicKey.ts',
] as const;
const observationWrapper = 'scripts/ptr-production-state-observation.mjs';
type GraphMember = { path: string; byteLength: number; sha256: string };

const native = process.platform === 'linux' && process.getuid?.() === 0 && donor !== undefined;
const command = (args: string[], cwd: string) => execFileSync('/usr/bin/git', ['-c', `safe.directory=${resolve(cwd)}`,
  '-c', 'commit.gpgsign=false', '-c', 'user.name=Preflight Fixture', '-c', 'user.email=fixture@example.invalid',
  ...args], { cwd, encoding: 'utf8' }).trim();

it.each(['g002-update-inspect', 'g002-update-apply'] as const)('recognizes fixed %s before enforcing native runtime authority', async operation => {
  await expect(runSealedRealmsProductionLinuxOperation({ operation, workflowInputSha: 'a'.repeat(40) } as never))
    .rejects.toMatchObject({ phase: 'runtime' });
});

it.each(['g001-policy-observe', 'g002-publish-apply', 'ptr-owner-provision', 'activation-evidence-generate'])(
  'rejects mutation selection before host or source work: %s', async operation => {
    await expect(runSealedRealmsProductionLinuxPreflight({ operation, workflowInputSha: 'a'.repeat(40) } as never))
      .rejects.toMatchObject({ phase: 'input' });
  });
it.each(['g002-publish-inspect', 'g002-import-inspect', 'g002-live-inspect'])(
  'keeps unsupported G002 dispatch outside the native preflight caller: %s', async operation => {
    await expect(runSealedRealmsProductionLinuxOperation({ operation, workflowInputSha: 'a'.repeat(40) } as never))
      .rejects.toMatchObject({ phase: 'input' });
  });
it('rejects caller-selected paths, hashes, factories, proxies and hidden inputs', async () => {
  for (const extra of [{ bundlePath: '/private/fixture' }, { sha256: 'a'.repeat(64) }, { factory: () => ({}) }]) {
    await expect(runSealedRealmsProductionLinuxPreflight({ operation: 'preflight', workflowInputSha: 'a'.repeat(40), ...extra } as never))
      .rejects.toMatchObject({ phase: 'input' });
  }
  await expect(runSealedRealmsProductionLinuxPreflight(new Proxy({}, {}) as never)).rejects.toMatchObject({ phase: 'input' });
});
it('the executable returns one bounded public input failure without echoing arguments', () => {
  const child = spawnSync(process.execPath, [entry, '--operation=preflight', '--source=private-fixture-value'],
    { encoding: 'utf8', env: {}, timeout: 20_000 });
  expect(child.status).toBe(1); expect(child.stdout).toBe('');
  expect(child.stderr).toBe('{"operation":"preflight","status":"failed","phase":"input"}\n');
});

// Real UID1000, Node, filesystem and immutable compiled bundle in an isolated
// mount namespace. Normal unprivileged CI keeps these privileged cases skipped;
// the bounded native proof runs them as root with an explicit prepared donor.
describe.skipIf(!native).sequential('native fixed Linux preflight', () => {
  let outer: string, home: string, repo: string, node: string, baseline: string;
  let actualHomeIdentity: { dev: number; ino: number; uid: number; mode: number };
  const operationRoot = () => join(home, '.warpkeep/private/sealed-realms-v1');
  function privateDirectory(path: string) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    let current = path;
    while (current.startsWith(home)) { chmodSync(current, current === home ? 0o750 : 0o700); chownSync(current, 1000, 1000); if (current === home) break; current = dirname(current); }
  }
  function chownTree(path: string) {
    const status = lstatSync(path); lchownSync(path, 1000, 1000);
    if (status.isDirectory()) for (const name of readdirSync(path)) chownTree(join(path, name));
  }
  function privateInventory(path = operationRoot()): string[] {
    if (!existsSync(path)) return [];
    return readdirSync(path).flatMap(name => {
      const file = join(path, name);
      return [file.slice(operationRoot().length), ...(lstatSync(file).isDirectory() ? privateInventory(file) : [])];
    });
  }
  function replaceNode(append = false) {
    const replacement = `${node}.replacement`;
    copyFileSync(process.execPath, replacement);
    if (append) writeFileSync(replacement, Buffer.concat([readFileSync(replacement), Buffer.from('\n')]));
    chmodSync(replacement, 0o500); chownSync(replacement, 1000, 1000); renameSync(replacement, node);
  }
  function capture(scenario: string, overrides: Record<string, string> = {}, uid = 1000,
    operation: 'preflight' | 'activation-evidence-inspect' | 'g002-update-inspect' = 'preflight') {
    const commit = command(['rev-parse', 'HEAD'], repo);
    command(['update-ref', 'refs/remotes/origin/main', commit], repo);
    const environment = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C',
      RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64', RUNNER_NAME: 'warpkeep-wsl-production-01',
      RUNNER_TEMP: '/home/warpkeep/actions-runner/_work/_temp', GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'ael-dev3/Warpkeep', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: commit,
      GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_JOB: 'operate_readonly', WARPKEEP_OPERATION: operation, GITHUB_WORKFLOW: 'Sealed Realms Production',
      GITHUB_WORKFLOW_REF: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main',
      GITHUB_RUN_ID: '7001', GITHUB_RUN_ATTEMPT: '1', GITHUB_TOKEN: 'native-fixture-' + 'x'.repeat(32), ...overrides };
    const shell = 'mount --make-rprivate / && mount --bind "$1" /home/warpkeep && cd /home/warpkeep/actions-runner/_work/Warpkeep/Warpkeep && exec setpriv --reuid="$2" --regid="$2" --clear-groups /home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /home/warpkeep/process.mjs "$3"';
    const result = spawnSync('/usr/bin/unshare', ['--mount', '/bin/sh', '-c', shell, 'native-preflight', home, String(uid), scenario],
      { encoding: 'utf8', env: environment, timeout: 90_000, maxBuffer: 16 * 1024 });
    expect(result.signal).toBeNull(); expect(result.error).toBeUndefined(); expect(result.stderr).toBe('');
    return { status: result.status, output: JSON.parse(result.stdout) };
  }
  function withGraphMutation(lane: 'activation' | 'g001', mutate: (members: GraphMember[]) => void,
    consume: () => void) {
    const relativePath = 'scripts/sealed-realms-production-bundle-manifest-v1.json';
    const path = join(repo, relativePath);
    try {
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      const selected = manifest.bundles.find((item: { lane: string }) => item.lane === lane);
      mutate(selected.graphManifest);
      selected.graphManifest.sort((a: GraphMember, b: GraphMember) => a.path < b.path ? -1 : 1);
      selected.sourceClosureDigest = deriveSealedRealmOperationBundleSourceClosureDigest(lane, selected.graphManifest);
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
      command(['add', '--', relativePath], repo);
      command(['commit', '--quiet', '-m', 'adversarial observation graph fixture'], repo);
      consume();
    } finally {
      command(['reset', '--hard', baseline], repo);
      chownTree(join(repo, '.git')); chownSync(path, 1000, 1000);
    }
  }
  beforeAll(() => {
    const actual = lstatSync('/home/warpkeep');
    actualHomeIdentity = { dev: actual.dev, ino: actual.ino, uid: actual.uid, mode: actual.mode };
    outer = mkdtempSync(join(tmpdir(), 'sealed-linux-preflight-')); home = join(outer, 'home');
    privateDirectory(join(home, 'actions-runner/_work/_temp'));
    privateDirectory(join(home, '.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin'));
    repo = join(home, 'actions-runner/_work/Warpkeep/Warpkeep');
    command(['clone', '--quiet', '--no-hardlinks', donor!, repo], root);
    command(['checkout', '--quiet', '--detach', 'HEAD'], repo);
    command(['remote', 'set-url', 'origin', 'https://github.com/ael-dev3/Warpkeep.git'], repo);
    baseline = command(['rev-parse', 'HEAD'], repo);
    chownTree(repo);
    node = join(home, '.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node');
    copyFileSync(process.execPath, node); chmodSync(node, 0o500); chownSync(node, 1000, 1000);
    copyFileSync(join(root, 'tests/fixtures/sealedRealmsLinuxPreflightProcess.mjs'), join(home, 'process.mjs'));
    chmodSync(join(home, 'process.mjs'), 0o644); chownSync(join(home, 'process.mjs'), 1000, 1000);
    for (const path of ['audit/private', 'runtime', 'cache']) privateDirectory(join(operationRoot(), path));
    chmodSync(home, 0o750);
  }, 90_000);
  afterAll(() => {
    const actual = lstatSync('/home/warpkeep');
    expect({ dev: actual.dev, ino: actual.ino, uid: actual.uid, mode: actual.mode }).toEqual(actualHomeIdentity);
    if (outer && resolve(outer).startsWith(`${resolve(tmpdir())}/sealed-linux-preflight-`)) rmSync(outer, { recursive: true });
  });
  it('invokes the real fixed factory/run with read-only simulated GitHub evidence and no private writes', () => {
    const before = privateInventory();
    const result = capture('complete');
    expect(result).toMatchObject({ status: 0, output: { result: { operation: 'preflight', status: 'preflight-inspected' }, onlyReadRequests: true } });
    expect(result.output.calls).toBeGreaterThan(10); expect(privateInventory()).toEqual(before);
  }, 90_000);
  it.each(['activation', 'g002'])('the prepared %s graph retains the exact observation service bytes', lane => {
    const manifest = JSON.parse(readFileSync(join(repo, 'scripts/sealed-realms-production-bundle-manifest-v1.json'), 'utf8'));
    const selected = manifest.bundles.find((item: { lane: string }) => item.lane === lane);
    expect(selected.graphManifest.filter((member: GraphMember) => member.path.startsWith('services/'))
      .map((member: GraphMember) => member.path)).toEqual(observationServicePaths);
    for (const path of [observationWrapper, ...observationServicePaths]) {
      const bytes = readFileSync(join(repo, path));
      expect(selected.graphManifest.filter((member: GraphMember) => member.path === path)).toEqual([
        { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
      ]);
    }
    // Observation service source belongs only to the selected sealed update
    // graphs; it does not widen G001's independent boundary.
    const g001 = manifest.bundles.find((item: { lane: string }) => item.lane === 'g001');
    expect(g001.graphManifest.some((member: GraphMember) => member.path.startsWith('services/'))).toBe(false);
  });
  it('accepts the activation observation graph through attested import before requiring workflow authority', () => {
    const before = privateInventory();
    // The real factory fails closed without its token only after the actual
    // source, graph, dependency bytes, deployment closure and bundle import pass.
    const result = capture('observe-closure', { GITHUB_TOKEN: '' }, 1000, 'activation-evidence-inspect');
    expect(result).toMatchObject({ status: 1, output: { phase: 'workflow', calls: 0, onlyReadRequests: true } });
    expect(result.output.closureManifestOpens).toBeGreaterThan(0);
    expect(privateInventory()).toEqual(before);
  }, 90_000);
  it('imports the fixed G002 update runtime only under its dedicated protected job', () => {
    const before = privateInventory();
    const wrongJob = capture('observe-closure', { GITHUB_JOB: 'operate_ptr', GITHUB_TOKEN: '' }, 1000, 'g002-update-inspect');
    expect(wrongJob).toEqual({ status: 1, output: { phase: 'runtime', calls: 0, onlyReadRequests: true, closureManifestOpens: 0 } });
    const selected = capture('observe-closure', { GITHUB_JOB: 'operate_g002', GITHUB_TOKEN: '' }, 1000, 'g002-update-inspect');
    expect(selected).toMatchObject({ status: 1, output: { phase: 'workflow', calls: 0, onlyReadRequests: true } });
    expect(selected.output.closureManifestOpens).toBeGreaterThan(0);
    expect(privateInventory()).toEqual(before);
  }, 90_000);
  it.each([observationWrapper, ...observationServicePaths])('rejects a missing activation observation graph member: %s', path => {
    const before = privateInventory();
    withGraphMutation('activation', members => {
      const index = members.findIndex(member => member.path === path);
      expect(index).toBeGreaterThanOrEqual(0); members.splice(index, 1);
    }, () => expect(capture('observe-closure', { GITHUB_TOKEN: '' }, 1000, 'activation-evidence-inspect')).toEqual({ status: 1,
      output: { phase: 'bundle', calls: 0, onlyReadRequests: true, closureManifestOpens: 0 } }));
    expect(privateInventory()).toEqual(before);
  }, 90_000);
  it.each(observationServicePaths)('rejects activation observation source hash substitution: %s', path => {
    withGraphMutation('activation', members => {
      const member = members.find(member => member.path === path)!;
      expect(member).toBeDefined(); member.sha256 = member.sha256 === 'a'.repeat(64) ? 'b'.repeat(64) : 'a'.repeat(64);
    }, () => expect(capture('observe-closure', { GITHUB_TOKEN: '' }, 1000, 'activation-evidence-inspect')).toEqual({ status: 1,
      output: { phase: 'bundle', calls: 0, onlyReadRequests: true, closureManifestOpens: 0 } }));
  }, 90_000);
  it.each([
    ['activation', 'services/release-recovery/src/githubEvidence.ts', 'activation-evidence-inspect'],
    ['g001', observationServicePaths[0], 'preflight'],
  ] as const)('rejects a service outside the selected %s graph: %s', (lane, path, operation) => {
    const bytes = readFileSync(join(repo, path));
    const before = privateInventory();
    withGraphMutation(lane, members => {
      expect(members.some(member => member.path === path)).toBe(false);
      members.push({ path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }, () => expect(capture('observe-closure', { GITHUB_TOKEN: '' }, 1000, operation)).toEqual({ status: 1,
      output: { phase: 'bundle', calls: 0, onlyReadRequests: true, closureManifestOpens: 0 } }));
    expect(privateInventory()).toEqual(before);
  }, 90_000);
  it.each(['NODE_OPTIONS', 'NODE_PATH', 'LD_PRELOAD', 'GIT_OBJECT_DIRECTORY'])('rejects ambient %s before source or HTTP', key => {
    const result = capture('complete', { [key]: '' });
    expect(result).toEqual({ status: 1, output: { phase: 'runtime', calls: 0, onlyReadRequests: true } });
  });
  it('rejects root as a substitute for the configured runner identity', () => {
    expect(capture('complete', {}, 0)).toEqual({ status: 1,
      output: { phase: 'runtime', calls: 0, onlyReadRequests: true } });
  });
  it('rejects a symbolic-link runtime path without following a caller-selected executable', () => {
    const alternate = `${node}.actual`;
    renameSync(node, alternate); symlinkSync('node.actual', node);
    try { expect(capture('complete')).toEqual({ status: 1,
      output: { phase: 'runtime', calls: 0, onlyReadRequests: true } }); }
    finally { rmSync(node); renameSync(alternate, node); }
  });
  it.each(['missing-token', 'wrong-job', 'failed-verify', 'changed-import', 'extra-export', 'changed-source-after-auth'])(
    'rejects unavailable/replaced actual authority: %s', scenario => {
      try {
        const override: Record<string, string> = scenario === 'missing-token' ? { GITHUB_TOKEN: '' }
          : scenario === 'wrong-job' ? { GITHUB_JOB: 'other' } : {};
        const result = capture(scenario, override);
        expect(result.status).toBe(1);
        if (scenario === 'wrong-job') expect(result.output.phase).toBe('runtime');
        else expect(['workflow', 'bundle', 'source']).toContain(result.output.phase);
        if (['changed-import', 'extra-export'].includes(scenario)) expect(result.output.calls).toBe(0);
      } finally { command(['restore', '--source', baseline, '--worktree', '--', 'scripts/sealed-realms-production-g001-workflow-entry.mjs'], repo); chownSync(join(repo, 'scripts/sealed-realms-production-g001-workflow-entry.mjs'), 1000, 1000); }
    }, 90_000);
  it.each(['mode', 'owner', 'symlink', 'missing'])('rejects %s private roots without provisioning or writing', scenario => {
    const path = join(operationRoot(), 'runtime');
    try {
      if (scenario === 'mode') chmodSync(path, 0o755);
      if (scenario === 'owner') chownSync(path, 0, 0);
      if (scenario === 'symlink' || scenario === 'missing') rmSync(path, { recursive: true });
      if (scenario === 'symlink') symlinkSync(join(operationRoot(), 'cache'), path);
      const result = capture('complete'); expect(result.status).toBe(1); expect(result.output.phase).toBe('workflow');
      if (scenario === 'missing') expect(existsSync(path)).toBe(false);
    } finally {
      if (existsSync(path) && lstatSync(path).isSymbolicLink()) rmSync(path);
      privateDirectory(path);
    }
  }, 90_000);
  it.each(['node-mode', 'node-group', 'node-bytes'])('rejects actual immutable runtime mismatch: %s', scenario => {
    try {
      if (scenario === 'node-mode') chmodSync(node, 0o755);
      if (scenario === 'node-group') { chownSync(node, 1000, 0); chmodSync(node, 0o500); }
      if (scenario === 'node-bytes') replaceNode(true);
      const result = capture('complete'); expect(result).toEqual({ status: 1, output: { phase: 'runtime', calls: 0, onlyReadRequests: true } });
    } finally { replaceNode(); }
  });
  it.each(['source-tree', 'graph-hash', 'dependency-hash', 'exports', 'bundle-path'])(
    'rejects committed inconsistent prepared evidence: %s', scenario => {
      const path = join(repo, 'scripts/sealed-realms-production-bundle-manifest-v1.json');
      try {
        const manifest = JSON.parse(readFileSync(path, 'utf8'));
        const g001 = manifest.bundles.find((item: { lane: string }) => item.lane === 'g001');
        if (scenario === 'source-tree') manifest.sourceTree = 'a'.repeat(40);
        if (scenario === 'graph-hash') g001.graphManifest.find((item: { path: string }) => item.path.startsWith('scripts/')).sha256 = 'a'.repeat(64);
        if (scenario === 'dependency-hash') {
          g001.graphManifest.push({ path: 'node_modules/yaml/dist/index.js', byteLength: 100, sha256: 'a'.repeat(64) });
          g001.graphManifest.sort((a: { path: string }, b: { path: string }) => a.path < b.path ? -1 : 1);
        }
        if (['graph-hash', 'dependency-hash'].includes(scenario)) {
          g001.sourceClosureDigest = deriveSealedRealmOperationBundleSourceClosureDigest('g001', g001.graphManifest);
        }
        if (scenario === 'exports') g001.exportNames.push('arbitraryFactory');
        if (scenario === 'bundle-path') g001.path = 'scripts/other.mjs';
        writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
        command(['add', '--', 'scripts/sealed-realms-production-bundle-manifest-v1.json'], repo);
        command(['commit', '--quiet', '-m', 'adversarial fixture'], repo);
        const result = capture('complete'); expect(result.status).toBe(1); expect(result.output.phase).toBe('bundle'); expect(result.output.calls).toBe(0);
      } finally { command(['reset', '--hard', baseline], repo); chownTree(join(repo, '.git')); chownSync(path, 1000, 1000); }
    }, 90_000);
});
