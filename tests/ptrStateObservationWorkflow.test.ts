// @vitest-environment node
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { expect, it } from 'vitest';

it('scopes PTR observation and update OIDC to their protected jobs', () => {
  const workflow = parse(readFileSync('.github/workflows/sealed-realms-production.yml', 'utf8'));
  expect(workflow.on.workflow_dispatch.inputs.operation.options).toContain('ptr-state-inspect');
  const job = workflow.jobs.observe_ptr;
  expect(job).toBeDefined();
  expect(job.environment).toBe('notification-bridge-prepared');
  expect(job.permissions).toEqual({ 'actions': 'read', 'contents': 'read', 'id-token': 'write' });
  expect(job['runs-on']).toEqual(['self-hosted', 'Linux', 'X64', 'warpkeep-production-admin', 'warpkeep-repository-exclusive']);
  expect(job.if).toContain("github.ref == 'refs/heads/main'");
  expect(job.if).toContain('github.sha == inputs.source_commit');
  expect(job.if).toContain("inputs.operation == 'ptr-state-inspect'");
  expect(workflow.concurrency).toEqual({ group: 'warpkeep-production-state', 'cancel-in-progress': false });
  const body = JSON.stringify(job);
  expect(body).toContain('scripts/sealed-realms-production-linux-preflight.mjs');
  expect(body).toContain('ACTIONS_ID_TOKEN_REQUEST_URL|ACTIONS_ID_TOKEN_REQUEST_TOKEN');
  expect(body).not.toMatch(/secrets\.|SPACETIME_BIN|CLI_CONFIG|DEPENDENCY_CACHE|CLOUDFLARE/);
  expect(workflow.permissions?.['id-token']).not.toBe('write');
  expect(workflow.jobs.operate_readonly.permissions?.['id-token']).not.toBe('write');
  // Updates obtain signed pre/post observations in their existing protected job.
  const update = workflow.jobs.operate_ptr;
  expect(update.permissions).toEqual({ 'actions': 'read', 'contents': 'read', 'id-token': 'write' });
  expect(update.environment).toBe('notification-bridge-prepared');
  expect(update['runs-on']).toEqual(['self-hosted', 'Linux', 'X64', 'warpkeep-production-admin', 'warpkeep-repository-exclusive']);
  expect(update.if.replace(/\s+/gu, ' ').trim()).toBe([
    "github.event_name == 'workflow_dispatch'",
    "github.repository == 'ael-dev3/Warpkeep'",
    "github.ref == 'refs/heads/main'",
    'github.sha == inputs.source_commit',
    'contains(fromJSON(\'["ptr-update-inspect","ptr-update-apply"]\'), inputs.operation)',
  ].join(' && '));
  expect(JSON.stringify(update)).toContain('ACTIONS_ID_TOKEN_REQUEST_URL|ACTIONS_ID_TOKEN_REQUEST_TOKEN');
});
