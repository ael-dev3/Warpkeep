// @vitest-environment node
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { expect, it } from 'vitest';

it('routes PTR state observation through its protected OIDC job without provider credentials', () => {
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
  expect(workflow.jobs.operate_readonly.permissions?.['id-token']).not.toBe('write');
  expect(workflow.jobs.operate_ptr.permissions?.['id-token']).not.toBe('write');
});
