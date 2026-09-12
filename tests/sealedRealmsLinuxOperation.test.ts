// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as caller from '../scripts/sealed-realms-production-linux-preflight.mjs';
describe('fixed Linux operation input boundary',()=>{
 it.each(['g002-publish-apply','ptr-owner-provision','arbitrary'])('refuses unwired operation %s before host work',async operation=>{
  await expect(caller.runSealedRealmsProductionLinuxOperation({operation,workflowInputSha:'a'.repeat(40)} as never)).rejects.toMatchObject({phase:'input'});
 });
 it.each(['preflight','g001-policy-observe','activation-evidence-inspect','activation-evidence-generate','ptr-update-inspect','ptr-update-apply'])('routes supported operation %s into host attestation',async operation=>{
  await expect(caller.runSealedRealmsProductionLinuxOperation({operation,workflowInputSha:'a'.repeat(40)} as never)).rejects.toMatchObject({phase:'runtime'});
 });
 it('refuses caller-selected dispatch dependencies',async()=>{
  await expect(caller.runSealedRealmsProductionLinuxOperation({operation:'preflight',workflowInputSha:'a'.repeat(40),factory:()=>({})} as never)).rejects.toMatchObject({phase:'input'});
 });
});

describe('fixed Linux operation executable boundary', () => {
 const executable = fileURLToPath(new URL('../scripts/sealed-realms-production-linux-preflight.mjs', import.meta.url));
 function invoke(args: string[]) {
  // A fresh process without runner context must stop at host attestation.
  // This exercises the workflow's CLI without accessing private state or providers.
  const result = spawnSync(process.execPath, [executable, ...args], {
   env: {}, encoding: 'utf8', timeout: 10_000, windowsHide: true,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  return JSON.parse(result.stderr);
 }

 it.each(['preflight', 'g001-policy-observe', 'activation-evidence-inspect', 'activation-evidence-generate', 'ptr-update-inspect', 'ptr-update-apply'])(
  'accepts the workflow operation %s and requires host attestation', operation => {
   expect(invoke([`--operation=${operation}`, `--source=${'a'.repeat(40)}`]))
    .toEqual({ operation, status: 'failed', phase: 'runtime' });
  });

 it.each(['g002-publish-apply', 'ptr-owner-provision', 'arbitrary', 'constructor', '__proto__'])(
  'rejects unsupported CLI operation %s before host work', operation => {
   expect(invoke([`--operation=${operation}`, `--source=${'a'.repeat(40)}`]))
    .toMatchObject({ status: 'failed', phase: 'input' });
  });

 it.each([
  ['--operation=g001-policy-observe', '--source=main'],
  ['--operation=g001-policy-observe'],
  ['--operation=g001-policy-observe', `--source=${'a'.repeat(40)}`, '--extra=true'],
  [`--source=${'a'.repeat(40)}`, '--operation=g001-policy-observe'],
 ])('rejects malformed CLI arguments %j', (...args) => {
  expect(invoke(args)).toMatchObject({ status: 'failed', phase: 'input' });
 });
});
