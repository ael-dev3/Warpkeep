// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  SEALED_REALMS_OPERATIONS,
} from '../scripts/sealed-realms-production-source-authority.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const workflow = (name: string) => readFileSync(
  resolve(repositoryRoot, `.github/workflows/${name}`),
  'utf8',
);
type VerificationStep = { name?: string; uses?: string; with?: Record<string, unknown>; shell?: string; run?: string; if?: string; env?: unknown };
type VerificationJob = {
  name?: string; needs?: string[]; if?: string; 'runs-on'?: string | string[];
  'timeout-minutes'?: number; environment?: unknown; permissions?: unknown; env?: unknown; steps: VerificationStep[];
};
const verification = () => parse(workflow('verify.yml')) as { permissions?: unknown; env?: unknown; jobs: Record<string, VerificationJob> };

describe('sealed-realms production workflow authority', () => {
  const hardenedShell = '/bin/bash --noprofile --norc -p -e -o pipefail {0}';
  it('admits fixed PTR and G002 existing-update choices', () => {
    const source = workflow('sealed-realms-production.yml');
    const document = parse(source) as {
      on?: { workflow_dispatch?: { inputs?: Record<string, unknown> } };
      permissions?: Record<string, unknown>;
    };
    const inputs = document.on?.workflow_dispatch?.inputs as Record<
      string,
      { required?: boolean; default?: string; type?: string; options?: string[] }
    >;
    expect(Object.keys(document.on ?? {})).toEqual(['workflow_dispatch']);
    expect(Object.keys(inputs)).toEqual(['source_commit', 'operation']);
    expect(inputs.source_commit).toMatchObject({ required: true, type: 'string' });
    expect(inputs.operation).toEqual({
      description: expect.any(String),
      required: true,
      default: 'preflight',
      type: 'choice',
      options: SEALED_REALMS_OPERATIONS,
    });
    expect(document.permissions).toEqual({ actions: 'read', contents: 'read' });
  });

  const production = () => parse(workflow('sealed-realms-production.yml')) as {
    jobs: Record<string, VerificationJob>;
  };
  const jobStep = (jobName: string, name: string) => {
    const step = production().jobs[jobName].steps.find(candidate => candidate.name === name);
    expect(step).toBeDefined();
    return step!;
  };
  const operationStep = (name: string) => jobStep(
    name === 'Refuse unwired provider operations' ? 'unsupported' : 'operate',
    name,
  );
  const guardName = 'Require installed Linux operation authority';
  const executeName = 'Attest runtime and execute authenticated operation';
  const refusalName = 'Refuse unwired provider operations';

  it('separates generation OIDC from readonly operations on the exact protected runner', () => {
    const document=production();expect(Object.keys(document.jobs)).toEqual(['operate_readonly','observe_ptr','operate','operate_ptr','operate_g002','unsupported']);
    const common=["github.event_name == 'workflow_dispatch'", "github.repository == 'ael-dev3/Warpkeep'", "github.ref == 'refs/heads/main'", 'github.sha == inputs.source_commit'];
    for(const name of ['operate_readonly','observe_ptr','operate']) {
      const job=document.jobs[name];for(const expression of common)expect(job.if).toContain(expression);
      expect(job).toMatchObject({environment:'notification-bridge-prepared','runs-on':['self-hosted','Linux','X64','warpkeep-production-admin','warpkeep-repository-exclusive']});
      expect(job.steps.map(step=>step.name)).toEqual([guardName,'Checkout exact selected authority',executeName]);
      expect(job.steps[1]).toMatchObject({with:{ref:'${{ inputs.source_commit }}','fetch-depth':0,'persist-credentials':false}});
      expect(job.env).toEqual({WARPKEEP_OPERATION:'${{ inputs.operation }}'});
      for(const step of job.steps.filter(step=>step.run))expect(step.shell).toBe(hardenedShell);
    }
    expect(document.jobs.operate.permissions).toEqual({actions:'read',contents:'read','id-token':'write'});
    expect(document.jobs.observe_ptr.permissions).toEqual({actions:'read',contents:'read','id-token':'write'});
    expect(document.jobs.observe_ptr.if).toContain("inputs.operation == 'ptr-state-inspect'");
    expect(document.jobs.observe_ptr['timeout-minutes']).toBe(10);
    expect(document.jobs.operate.if).toContain("inputs.operation == 'activation-evidence-generate'");
    expect(document.jobs.operate_readonly.permissions).toBeUndefined();
    expect(document.jobs.operate_readonly.if).toContain('["preflight","activation-evidence-inspect","g001-policy-observe"]');
    expect(document.jobs.operate_ptr.permissions).toEqual({actions:'read',contents:'read','id-token':'write'});
    expect(document.jobs.operate_ptr.if).toContain('["ptr-update-inspect","ptr-update-apply"]');
    expect(document.jobs.operate_g002.if).toContain('["g002-update-inspect","g002-update-apply"]');
    expect(document.jobs.unsupported.if).toContain('"g002-update-inspect","g002-update-apply"');
    expect(document.jobs.unsupported.steps[0].run).toContain('SEALED_REALMS_LINUX_OPERATION_UNAVAILABLE');
    expect(document.jobs.unsupported.if).toContain('"ptr-update-inspect","ptr-update-apply"');
    expect(document.jobs.unsupported.if).toContain('"ptr-state-inspect"');
    const source=workflow('sealed-realms-production.yml');
    expect(source).not.toMatch(/(?:npm|pnpm|npx|tsx) (?:ci|install|run)/u);
    expect(source).not.toMatch(/console\.log|set -x|printenv|^\s*env\s*$/mu);
    for(const reference of source.matchAll(/uses:\s*([^\s]+)/gu))expect(reference[1]).toMatch(/@[0-9a-f]{40}$/u);
  });

  it('limits observation transport to its exact workload OIDC and GitHub credentials', () => {
    const execute = jobStep('observe_ptr', executeName);
    expect(execute.env).toEqual({ WARPKEEP_SOURCE_COMMIT: '${{ inputs.source_commit }}', GITHUB_TOKEN: '${{ github.token }}' });
    const allowlist = execute.run!.match(/PATH\|HOME\|LANG\|LC_ALL\|[^\n]+(?=\) ;;)/u)?.[0].split('|');
    expect(allowlist).toEqual(['PATH', 'HOME', 'LANG', 'LC_ALL', 'RUNNER_OS', 'RUNNER_ARCH', 'RUNNER_NAME', 'RUNNER_TEMP',
      'GITHUB_ACTIONS', 'GITHUB_REPOSITORY', 'GITHUB_REF', 'GITHUB_SHA', 'GITHUB_EVENT_NAME', 'GITHUB_JOB',
      'GITHUB_WORKFLOW', 'GITHUB_WORKFLOW_REF', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_TOKEN', 'WARPKEEP_OPERATION',
      'ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN']);
    expect(JSON.stringify(production().jobs.observe_ptr)).not.toMatch(/secrets\.|WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT|SPACETIME_BIN|WARPKEEP_SPACETIME_CLI_CONFIG_PATH/u);
    expect(jobStep('observe_ptr', guardName).run).toContain("test \"$GITHUB_JOB\" = 'observe_ptr'");
  });

  it.each(['ptr', 'g002'])('routes %s updates through a dedicated exact-source job with bounded OIDC and no provider secrets', lane => {
    const job = production().jobs[`operate_${lane}`];
    expect(job).toBeDefined();
    const common = ["github.event_name == 'workflow_dispatch'", "github.repository == 'ael-dev3/Warpkeep'",
      "github.ref == 'refs/heads/main'", 'github.sha == inputs.source_commit'];
    for (const expression of common) expect(job.if).toContain(expression);
    expect(job).toMatchObject({
      permissions: { actions: 'read', contents: 'read', 'id-token': 'write' },
      environment: 'notification-bridge-prepared',
      'runs-on': ['self-hosted', 'Linux', 'X64', 'warpkeep-production-admin', 'warpkeep-repository-exclusive'],
      'timeout-minutes': 120,
      env: { WARPKEEP_OPERATION: '${{ inputs.operation }}' },
    });
    expect(job.steps.map(step => step.name)).toEqual([guardName, 'Checkout exact selected authority', executeName]);
    expect(job.steps[1]).toMatchObject({
      with: { ref: '${{ inputs.source_commit }}', 'fetch-depth': 0, 'persist-credentials': false },
    });
    for (const step of job.steps.filter(step => step.run)) expect(step.shell).toBe(hardenedShell);

    const guard = jobStep(`operate_${lane}`, guardName).run!;
    expect(guard).toContain(`test "$GITHUB_JOB" = 'operate_${lane}'`);
    for (const required of ["test \"$RUNNER_OS\" = 'Linux'", "test \"$RUNNER_ARCH\" = 'X64'",
      "test \"$RUNNER_NAME\" = 'warpkeep-wsl-production-01'", "test \"$(/usr/bin/id -u)\" = '1000'",
      "test \"$GITHUB_REF\" = 'refs/heads/main'", 'audit/private runtime cache']) expect(guard).toContain(required);
    expect(guard).not.toMatch(/mkdir|mktemp|install |chmod|chown/u);

    const execute = jobStep(`operate_${lane}`, executeName);
    expect(execute.env).toEqual({
      WARPKEEP_SOURCE_COMMIT: '${{ inputs.source_commit }}',
      GITHUB_TOKEN: '${{ github.token }}',
      WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT: `/home/warpkeep/.warpkeep/release-preparation-v1/cache/${lane === 'g002' ? 'genesis002' : 'ptr'}`,
      WARPKEEP_SPACETIME_CLI_CONFIG_PATH: '/home/warpkeep/.warpkeep/private/production-admin-v1/spacetime-cli.toml',
      SPACETIME_BIN: '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/spacetime-2.6.1/spacetimedb-cli',
    });
    expect(execute.env).not.toHaveProperty('WARPKEEP_PRODUCTION_ADMIN_TOKEN');
    expect(execute.env).not.toHaveProperty('WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN');
    expect(execute.env).not.toHaveProperty('WARPKEEP_PTR_SPACETIMEDB_DATABASE');
    const allowlist = execute.run!.match(/PATH\|HOME\|LANG\|LC_ALL\|[^\n]+(?=\) ;;)/u)?.[0].split('|');
    expect(allowlist).toEqual(['PATH', 'HOME', 'LANG', 'LC_ALL', 'RUNNER_OS', 'RUNNER_ARCH', 'RUNNER_NAME', 'RUNNER_TEMP',
      'GITHUB_ACTIONS', 'GITHUB_REPOSITORY', 'GITHUB_REF', 'GITHUB_SHA', 'GITHUB_EVENT_NAME', 'GITHUB_JOB',
      'GITHUB_WORKFLOW', 'GITHUB_WORKFLOW_REF', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_TOKEN', 'WARPKEEP_OPERATION',
      'WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT', 'WARPKEEP_SPACETIME_CLI_CONFIG_PATH', 'SPACETIME_BIN',
      'ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN']);
    expect(execute.run).toContain('*) unset "$key" ;;');
    expect(execute.run).not.toContain('GITHUB_TOKEN=');
    expect(execute.run).not.toContain('$GITHUB_TOKEN');
    expect(execute.run).toContain('exec "$source_node" scripts/sealed-realms-production-linux-preflight.mjs');
    expect(execute.run).toContain('"--operation=$WARPKEEP_OPERATION" "--source=$GITHUB_SHA"');
  });

  it('requires installed account and private state without provisioning authority', () => {
    for (const jobName of ['operate', 'operate_ptr', 'operate_g002', 'observe_ptr']) {
      const guard = jobStep(jobName, guardName).run!;
      for (const required of ["test \"$RUNNER_OS\" = 'Linux'", "test \"$RUNNER_ARCH\" = 'X64'",
        "test \"$RUNNER_NAME\" = 'warpkeep-wsl-production-01'", "test \"$(/usr/bin/id -u)\" = '1000'",
        "test \"$(/usr/bin/id -g)\" = '1000'", "test \"$(/usr/bin/id -un)\" = 'warpkeep'",
        "test \"$(/usr/bin/id -ru)\" = '1000'", "test \"$(/usr/bin/id -rg)\" = '1000'",
        "test \"$GITHUB_REF\" = 'refs/heads/main'", `test "$GITHUB_JOB" = '${jobName}'`,
        '/home/warpkeep/actions-runner', "'1000:1000:700'", 'audit/private runtime cache',
        '/home/warpkeep/.warpkeep/private/sealed-realms-v1/$suffix']) expect(guard).toContain(required);
      expect(guard).not.toMatch(/mkdir|mktemp|install |chmod|chown/u);
      expect(guard.indexOf('SEALED_REALMS_LINUX_AMBIENT_OVERRIDE_INVALID')).toBeLessThan(guard.indexOf('/usr/bin/id -u'));
    }
  });

  it('attests fixed runtime bytes and immutable bootstrap source before calling preflight', () => {
    for (const jobName of ['operate', 'operate_ptr', 'operate_g002', 'observe_ptr']) {
      const execute = jobStep(jobName, executeName).run!;
      for (const required of [
        'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2',
        '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668',
        '1000:1000:1:500:124819136', '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node',
        "'0:0:1:755'",
        'test -f "$source_node" && test -x "$source_node" && test ! -L "$source_node"', 'check_parents "${source_node%/*}"',
        'GIT_NO_REPLACE_OBJECTS=1', '--no-replace-objects --no-optional-locks', 'core.hooksPath=/dev/null',
        "'HEAD^{commit}'", "'refs/remotes/origin/main^{commit}'", 'status --porcelain=v1 --untracked-files=all',
        'scripts/sealed-realms-production-linux-preflight.mjs', 'scripts/local-binding-bounded-file.mjs',
        'scripts/sealed-realms-production-bundle-engine.mjs', 'scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
        '1000:1000:1:644', 'git_source ls-tree', 'git_source show "$WARPKEEP_SOURCE_COMMIT:$path" | /usr/bin/cmp --silent -- "$path" -',
        'exec "$source_node" scripts/sealed-realms-production-linux-preflight.mjs',
        '"--operation=$WARPKEEP_OPERATION" "--source=$GITHUB_SHA"',
      ]) expect(execute).toContain(required);
      const call = execute.indexOf('exec "$source_node"');
      expect(call).toBeGreaterThan(execute.indexOf('/usr/bin/cmp --silent'));
      expect(call).toBeGreaterThan(execute.lastIndexOf('/usr/bin/sha256sum --check --strict --status -'));
      expect(execute).not.toMatch(/--eval|--input-type|--import|expected-digest|WARPKEEP_NODE_EXECUTABLE/u);
      expect(execute).not.toMatch(/\bnode\s+--version/u);
    }
  });

  it('captures activation credentials only in the exact caller environment and preserves run context', () => {
    const credentials = {
      WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: "${{ startsWith(inputs.operation, 'activation-evidence-') && secrets.WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID || '' }}",
      WARPKEEP_AUTH_BRIDGE_ZONE_ID: "${{ startsWith(inputs.operation, 'activation-evidence-') && secrets.WARPKEEP_AUTH_BRIDGE_ZONE_ID || '' }}",
      WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN: "${{ startsWith(inputs.operation, 'activation-evidence-') && secrets.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN || '' }}",
      WARPKEEP_PRODUCTION_ADMIN_TOKEN: "${{ startsWith(inputs.operation, 'activation-evidence-') && secrets.WARPKEEP_PRODUCTION_ADMIN_TOKEN || '' }}",
      WARPKEEP_PTR_SPACETIMEDB_DATABASE: "${{ startsWith(inputs.operation, 'activation-evidence-') && vars.WARPKEEP_PTR_SPACETIMEDB_DATABASE || '' }}",
    };
    const providerNames = Object.keys(credentials);
    for (const name of ['operate_readonly', 'operate']) {
      const job = production().jobs[name];
      const execute = job.steps.find(step => step.name === executeName)!;
      expect(job.steps.filter(step => (step.env as Record<string, unknown> | undefined)?.GITHUB_TOKEN)).toEqual([execute]);
      expect(execute.env).toEqual({ WARPKEEP_SOURCE_COMMIT: '${{ inputs.source_commit }}',
        GITHUB_TOKEN: '${{ github.token }}', ...credentials });
      for (const step of job.steps.filter(step => step !== execute)) {
        for (const key of providerNames) expect(step.env ?? {}).not.toHaveProperty(key);
      }
      const allowlist = execute.run!.match(/PATH\|HOME\|LANG\|LC_ALL\|[^\n]+(?=\) ;;)/u)?.[0].split('|');
      expect(allowlist).toEqual(['PATH', 'HOME', 'LANG', 'LC_ALL', 'RUNNER_OS', 'RUNNER_ARCH', 'RUNNER_NAME', 'RUNNER_TEMP',
        'GITHUB_ACTIONS', 'GITHUB_REPOSITORY', 'GITHUB_REF', 'GITHUB_SHA', 'GITHUB_EVENT_NAME', 'GITHUB_JOB',
        'GITHUB_WORKFLOW', 'GITHUB_WORKFLOW_REF', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_TOKEN', 'WARPKEEP_OPERATION',
        ...providerNames, ...(name === 'operate' ? ['ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN'] : [])]);
      expect(execute.run).toContain('*) unset "$key" ;;');
      expect(execute.run).not.toContain('GITHUB_TOKEN=');
      expect(execute.run).not.toContain('$GITHUB_TOKEN');
      for (const key of providerNames) expect(execute.run).not.toContain(`$${key}`);
    }
    const source = workflow('sealed-realms-production.yml');
    expect([...source.matchAll(/secrets\.([A-Z_]+)/gu)].map(match => match[1]).sort())
      .toEqual([...providerNames.slice(0, 4), ...providerNames.slice(0, 4)].sort());
  });

  function runShell(source: string, environment: Record<string, string>, syntaxOnly = false) {
    const directory = mkdtempSync(join(tmpdir(), 'sealed-workflow-shell-'));
    try {
      const script = join(directory, 'step.sh');
      writeFileSync(script, source);
      return spawnSync('/bin/bash', ['--noprofile', '--norc', '-p', '-e', '-o', 'pipefail', ...(syntaxOnly ? ['-n'] : []), script],
        { env: { PATH: '/usr/bin:/bin', ...environment }, encoding: 'utf8', timeout: 10_000, maxBuffer: 4096 });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }

  it.runIf(process.platform === 'linux')('parses every executable workflow step with native Bash', () => {
    for (const job of Object.values(production().jobs)) {
      for (const step of job.steps.filter(candidate => candidate.run)) {
        const result = runShell(step.run!, {}, true);
        expect(result.error).toBeUndefined(); expect(result.status).toBe(0);
        expect(result.stdout).toBe(''); expect(result.stderr).toBe('');
      }
    }
  });

  it.runIf(process.platform === 'linux')('ignores an actual ambient startup script before rejecting its presence', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sealed-workflow-startup-'));
    try {
      const startup = join(directory, 'startup.sh');
      const sentinel = join(directory, 'must-not-exist');
      writeFileSync(startup, 'printf executed > "$WARPKEEP_STARTUP_SENTINEL"\n');
      for (const jobName of ['operate', 'operate_ptr', 'operate_g002', 'observe_ptr']) {
        const result = runShell(jobStep(jobName, guardName).run!, { BASH_ENV: startup, WARPKEEP_STARTUP_SENTINEL: sentinel });
        expect(result.status).toBe(1); expect(result.stdout).toBe('');
        expect(result.stderr).toBe('SEALED_REALMS_LINUX_AMBIENT_OVERRIDE_INVALID\n');
        expect(existsSync(sentinel)).toBe(false);
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it.runIf(process.platform === 'linux')('preserves the authenticated source and token through the actual environment pruning block', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sealed-workflow-transport-'));
    try {
      // This fixed shell executable checks transport only; it is not Node or a
      // substitute for the caller's native runtime/source/evidence checks.
      writeFileSync(join(directory, 'node'), `#!/bin/sh
set -eu
test "$#" = 3
test "$1" = scripts/sealed-realms-production-linux-preflight.mjs
test "$2" = "--operation=$WARPKEEP_OPERATION"
test "$3" = "--source=$GITHUB_SHA"
test -n "$GITHUB_TOKEN"
test "\${WARPKEEP_SOURCE_COMMIT+x}" != x
test "\${WARPKEEP_UNRELATED+x}" != x
printf '%s\\n' fixed-argument-transport-ok
`, { mode: 0o700 });
      const execute = operationStep(executeName).run!;
      const transport = execute.slice(execute.lastIndexOf('while IFS= read -r key; do'));
      const result = runShell('set -eu\nsource_node="$WARPKEEP_FIXTURE_BIN/node"\n' + transport, {
        WARPKEEP_FIXTURE_BIN: directory, WARPKEEP_SOURCE_COMMIT: 'a'.repeat(40), GITHUB_SHA: 'a'.repeat(40),
        WARPKEEP_OPERATION: 'activation-evidence-generate', GITHUB_TOKEN: 'private-test-token-never-in-argv', WARPKEEP_UNRELATED: 'must-be-cleared',
      });
      expect(result.error).toBeUndefined(); expect(result.status).toBe(0); expect(result.stderr).toBe('');
      expect(result.stdout).toBe('fixed-argument-transport-ok\n');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it.runIf(process.platform === 'linux').each(SEALED_REALMS_OPERATIONS.filter(operation => ![
    'preflight', 'activation-evidence-inspect', 'activation-evidence-generate', 'g001-policy-observe',
    'ptr-update-inspect', 'ptr-update-apply', 'g002-update-inspect', 'g002-update-apply', 'ptr-state-inspect',
  ].includes(operation)))(
    'refuses %s without loading source or echoing caller data', operation => {
      const refusal = operationStep(refusalName);
      const result = runShell(refusal.run!, { WARPKEEP_OPERATION: operation, WARPKEEP_SOURCE_COMMIT: 'private-invalid-source' });
      expect(result.error).toBeUndefined(); expect(result.status).toBe(1); expect(result.stderr).toBe('');
      expect(result.stdout).toBe('WARPKEEP_OPERATION_RESULT {"status":"SEALED_REALMS_LINUX_OPERATION_UNAVAILABLE"}\n');
      expect(refusal.run).not.toMatch(/node|git|source_commit|\$WARPKEEP/u);
    },
  );

  it.runIf(process.platform === 'linux')('preserves observation OIDC through the actual pruning block while removing provider configuration', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sealed-workflow-observation-transport-'));
    try {
      writeFileSync(join(directory, 'node'), `#!/bin/sh
set -eu
test "$#" = 3
test "$1" = scripts/sealed-realms-production-linux-preflight.mjs
test "$2" = --operation=ptr-state-inspect
test "$3" = "--source=$GITHUB_SHA"
test "$GITHUB_TOKEN" = fixture-github-token
test "$ACTIONS_ID_TOKEN_REQUEST_TOKEN" = fixture-oidc-token
test "$ACTIONS_ID_TOKEN_REQUEST_URL" = https://fixture.actions.githubusercontent.com/token
test "\${WARPKEEP_PRODUCTION_ADMIN_TOKEN+x}" != x
test "\${WARPKEEP_AUTH_BRIDGE_ADMIN_TOKEN+x}" != x
test "\${WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT+x}" != x
test "\${WARPKEEP_SPACETIME_CLI_CONFIG_PATH+x}" != x
test "\${SPACETIME_BIN+x}" != x
test "\${WARPKEEP_SOURCE_COMMIT+x}" != x
printf '%s\\n' observation-fixed-argument-transport-ok
`, { mode: 0o700 });
      const execute = jobStep('observe_ptr', executeName).run!;
      const transport = execute.slice(execute.lastIndexOf('while IFS= read -r key; do'));
      const result = runShell('set -eu\nsource_node="$WARPKEEP_FIXTURE_BIN/node"\n' + transport, {
        WARPKEEP_FIXTURE_BIN: directory, WARPKEEP_SOURCE_COMMIT: 'a'.repeat(40), GITHUB_SHA: 'a'.repeat(40),
        WARPKEEP_OPERATION: 'ptr-state-inspect', GITHUB_TOKEN: 'fixture-github-token',
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture-oidc-token', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://fixture.actions.githubusercontent.com/token',
        WARPKEEP_PRODUCTION_ADMIN_TOKEN: 'must-be-cleared', WARPKEEP_AUTH_BRIDGE_ADMIN_TOKEN: 'must-be-cleared',
        WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT: 'must-be-cleared', WARPKEEP_SPACETIME_CLI_CONFIG_PATH: 'must-be-cleared', SPACETIME_BIN: 'must-be-cleared',
      });
      expect(result.error).toBeUndefined(); expect(result.status).toBe(0); expect(result.stderr).toBe('');
      expect(result.stdout).toBe('observation-fixed-argument-transport-ok\n');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it.runIf(process.platform === 'linux')('preserves PTR configuration and token through its actual environment pruning block', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sealed-workflow-ptr-transport-'));
    try {
      writeFileSync(join(directory, 'node'), `#!/bin/sh
set -eu
test "$#" = 3
test "$1" = scripts/sealed-realms-production-linux-preflight.mjs
test "$2" = "--operation=$WARPKEEP_OPERATION"
test "$3" = "--source=$GITHUB_SHA"
test -n "$GITHUB_TOKEN"
test "$WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT" = /home/warpkeep/.warpkeep/release-preparation-v1/cache/ptr
test "$WARPKEEP_SPACETIME_CLI_CONFIG_PATH" = /home/warpkeep/.warpkeep/private/production-admin-v1/spacetime-cli.toml
test "$SPACETIME_BIN" = /home/warpkeep/.warpkeep/release-preparation-v1/toolchain/spacetime-2.6.1/spacetimedb-cli
test "$ACTIONS_ID_TOKEN_REQUEST_TOKEN" = fixture-oidc-token
test "$ACTIONS_ID_TOKEN_REQUEST_URL" = https://fixture.actions.githubusercontent.com/token
test "\${WARPKEEP_PRODUCTION_ADMIN_TOKEN+x}" != x
test "\${WARPKEEP_SOURCE_COMMIT+x}" != x
test "\${WARPKEEP_UNRELATED+x}" != x
printf '%s\\n' ptr-fixed-argument-transport-ok
`, { mode: 0o700 });
      const execute = jobStep('operate_ptr', executeName).run!;
      const transport = execute.slice(execute.lastIndexOf('while IFS= read -r key; do'));
      const result = runShell('set -eu\nsource_node="$WARPKEEP_FIXTURE_BIN/node"\n' + transport, {
        WARPKEEP_FIXTURE_BIN: directory, WARPKEEP_SOURCE_COMMIT: 'a'.repeat(40), GITHUB_SHA: 'a'.repeat(40),
        WARPKEEP_OPERATION: 'ptr-update-apply', GITHUB_TOKEN: 'private-test-token-never-in-argv',
        WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT: '/home/warpkeep/.warpkeep/release-preparation-v1/cache/ptr',
        WARPKEEP_SPACETIME_CLI_CONFIG_PATH: '/home/warpkeep/.warpkeep/private/production-admin-v1/spacetime-cli.toml',
        SPACETIME_BIN: '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/spacetime-2.6.1/spacetimedb-cli',
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture-oidc-token',
        ACTIONS_ID_TOKEN_REQUEST_URL: 'https://fixture.actions.githubusercontent.com/token',
        WARPKEEP_PRODUCTION_ADMIN_TOKEN: 'must-be-cleared',
        WARPKEEP_UNRELATED: 'must-be-cleared',
      });
      expect(result.error).toBeUndefined(); expect(result.status).toBe(0); expect(result.stderr).toBe('');
      expect(result.stdout).toBe('ptr-fixed-argument-transport-ok\n');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it.runIf(process.platform === 'linux').each(['NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS',
    'ESBUILD_BINARY_PATH', 'TS_NODE_PROJECT', 'BUN_OPTIONS', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES',
    'GIT_CONFIG_COUNT', 'GIT_OBJECT_DIRECTORY', 'GIT_REPLACE_REF_BASE', 'BASH_ENV', 'ENV', 'OPENSSL_CONF',
    'SSL_CERT_FILE', 'PYTHONPATH', 'VITEST'])(
    'rejects even empty exported %s before any host, source or Node work', key => {
      for (const jobName of ['operate', 'operate_ptr', 'operate_g002', 'observe_ptr']) {
        for (const name of [guardName, executeName]) {
          const result = runShell(jobStep(jobName, name).run!, { [key]: '' });
          expect(result.error).toBeUndefined(); expect(result.status).toBe(1); expect(result.stdout).toBe('');
          expect(result.stderr).toBe('SEALED_REALMS_LINUX_AMBIENT_OVERRIDE_INVALID\n');
        }
      }
    },
  );

  it('shares one non-cancelling state lock with B0, prepared, and Pages', () => {
    const names = [
      'sealed-realms-production.yml',
      'notification-bridge-b0.yml',
      'notification-bridge-prepared.yml',
      'deploy-pages.yml',
    ];
    for (const name of names) {
      const source = workflow(name);
      const document = parse(source) as {
        concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
      };
      expect(document.concurrency).toEqual({
        group: 'warpkeep-production-state',
        'cancel-in-progress': false,
      });
      expect(source).not.toMatch(/^\s+cancel-in-progress: true\s*$/mu);
    }
  });

  it('keeps the stable verify check as an always-run aggregator including recovery', () => {
    const document = verification();
    expect(Object.keys(document.jobs ?? {})).toEqual([
      'linux', 'auth-bridge', 'release-recovery', 'spacetimedb-module', 'native-contract', 'verify',
    ]);
    expect(document.jobs?.verify).toMatchObject({
      name: 'verify',
      needs: ['linux', 'auth-bridge', 'release-recovery', 'spacetimedb-module', 'native-contract'],
    });
    expect(document.jobs?.verify?.if).toContain('always()');
    const predecessors = ['linux', 'auth-bridge', 'release-recovery', 'spacetimedb-module', 'native-contract'];
    const [accept, reject] = document.jobs.verify.steps;
    expect(document.jobs.verify.steps).toHaveLength(2);
    expect(accept.run).toBe('exit 0'); expect(reject.run).toBe('exit 1');
    expect(accept.if?.trim().split(/\s*&&\s*/u)).toEqual(predecessors.map(name => `needs.${name}.result == 'success'`));
    expect(reject.if?.trim().split(/\s*\|\|\s*/u)).toEqual(predecessors.map(name => `needs.${name}.result != 'success'`));
  });

  it('restricts native contracts to disposable hosted Linux X64 without privileged workflow authority', () => {
    const document = verification(); const job = document.jobs['native-contract'];
    expect(job['runs-on']).toBe('ubuntu-24.04'); expect(job['timeout-minutes']).toBe(30);
    expect(document.permissions).toEqual({ contents: 'read' });
    expect(document).not.toHaveProperty('env');
    for (const field of ['environment', 'permissions', 'env', 'if', 'continue-on-error', 'uses', 'secrets']) expect(job).not.toHaveProperty(field);
    expect(JSON.stringify(job)).not.toMatch(/secrets\s*\.|warpkeep-production-admin|self-hosted/u);
    for (const step of job.steps) expect(step).not.toHaveProperty('env');
    const guard = job.steps.find(step => step.name === 'Require disposable X64 Linux authority');
    expect(guard?.shell).toBe('bash');
    expect(guard?.run?.trim().split(/\r?\n/u).map(line => line.trim())).toEqual([
      'set -euo pipefail', 'test "$RUNNER_OS" = \'Linux\'', 'test "$RUNNER_ARCH" = \'X64\'',
    ]);
    expect(job.steps[0]).toMatchObject({ uses: 'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0', with: { 'persist-credentials': false } });
    expect(job.steps[1]).toBe(guard);
  });

  it('installs both exact runtime trees and re-attests Node before the isolated and ordinary native suites', () => {
    const document = verification(); const steps = document.jobs['native-contract'].steps;
    const expectedNames = ['Checkout', 'Require disposable X64 Linux authority', 'Setup Node',
      'Setup pinned pnpm for bridge runtime-contract tests', 'Stage Node in a runner-private toolchain path',
      'Install dependencies', 'Install exact bridge runtime-test toolchain', 'Re-attest runner-private Node after dependency install',
      'Verify isolated existing-update dispatch and recovery', 'Verify native production contracts'];
    expect(steps.map(step => step.name)).toEqual(expectedNames);
    expect(steps[2]).toMatchObject({ uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', with: { 'node-version': '22.22.3', cache: 'npm' } });
    expect(steps[3]).toMatchObject({ uses: 'pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271', with: { version: '11.7.0', run_install: false } });
    expect(steps[5].run?.trim().split(/\s+/u)).toEqual(['npm', 'ci']);
    expect(steps[6].run?.trim().split(/\s+/u)).toEqual(['pnpm', '--dir', 'services/auth-bridge', 'install', '--frozen-lockfile', '--ignore-scripts']);
    // Reuse the existing Linux job's complete staging/attestation contract, not a
    // second subtly different toolchain policy or weaker native-only variant.
    for (const index of [4, 7]) {
      const linux = document.jobs.linux.steps.find(step => step.name === expectedNames[index]);
      expect(linux).toBeDefined(); expect(steps[index]).toEqual(linux);
    }
    expect(steps[8].run?.trim()).toBe('bash scripts/test-sealed-realms-existing-update-linux.sh');
    expect(steps[9].run?.trim().split(/\s+/u)).toEqual(['npm', 'test', '--',
      'tests/sealedRealmsPublicActivationArtifactVerifier.test.ts',
      'tests/authBridgeNotificationPreparedReceipt.test.ts',
      'tests/authBridgeNotificationPreparedDeployRuntime.test.ts', '--maxWorkers=1']);
    for (const step of steps) { expect(step).not.toHaveProperty('if'); expect(step).not.toHaveProperty('continue-on-error'); }
  });

  it('makes prepared recovery an explicit no-deploy operation choice', () => {
    const source = workflow('notification-bridge-prepared.yml');
    const document = parse(source) as {
      on?: { workflow_dispatch?: { inputs?: Record<string, unknown> } };
    };
    const inputs = document.on?.workflow_dispatch?.inputs as Record<
      string,
      { required?: boolean; default?: string; type?: string; options?: string[] }
    >;
    expect(Object.keys(inputs)).toEqual(['source_commit', 'operation']);
    expect(inputs.operation).toEqual({
      description: expect.any(String),
      required: true,
      default: 'deploy',
      type: 'choice',
      options: ['deploy', 'recover-expired-authority-read-only'],
    });
    const deployStart = source.indexOf(
      '      - name: Run guarded prepared bridge deployment',
    );
    const recoveryStart = source.indexOf(
      '      - name: Recover expired authority without deployment',
    );
    expect(deployStart).toBeGreaterThan(-1);
    expect(recoveryStart).toBeGreaterThan(deployStart);
    expect(source.slice(deployStart, recoveryStart)).toContain(
      "inputs.operation == 'deploy'",
    );
    const recovery = source.slice(recoveryStart);
    expect(recovery).toContain(
      'runAuthBridgeNotificationPreparedReadOnlyRecovery',
    );
    expect(recovery).toContain('verified-read-only-recovery');
    expect(recovery).not.toContain(
      'await entrypoint.runAuthBridgeNotificationPreparedDeploy();',
    );
  });

  it('does not transport owner or PTR database authority into prepared recovery', () => {
    const source = workflow('notification-bridge-prepared.yml');
    const recoveryStart = source.indexOf(
      '      - name: Recover expired authority without deployment',
    );
    const recoveryEnd = source.indexOf(
      '      - name: Require a verified deployment or recovery',
      recoveryStart,
    );
    expect(recoveryStart).toBeGreaterThan(-1);
    expect(recoveryEnd).toBeGreaterThan(recoveryStart);
    const deploy = source.slice(0, recoveryStart);
    const recovery = source.slice(recoveryStart, recoveryEnd);
    for (const forbidden of [
      'WARPKEEP_PLAYER_CANARY_OWNER_FID',
      'WARPKEEP_PTR_SPACETIMEDB_DATABASE',
    ]) {
      expect(deploy).toContain(forbidden);
      expect(recovery).not.toContain(forbidden);
    }
    for (const required of [
      'WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID',
      'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
      'WARPKEEP_AUTH_BRIDGE_ZONE_ID',
      'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
      'WARPKEEP_NODE_EXECUTABLE',
    ]) expect(recovery).toContain(required);
  });
});
