// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as caller from '../scripts/sealed-realms-production-linux-preflight.mjs';
describe('fixed Linux operation input boundary',()=>{
 it.each(['g002-publish-apply','ptr-owner-provision','arbitrary'])('refuses unwired operation %s before host work',async operation=>{
  await expect(caller.runSealedRealmsProductionLinuxOperation({operation,workflowInputSha:'a'.repeat(40)} as never)).rejects.toMatchObject({phase:'input'});
 });
 it.each(['preflight','g001-policy-observe','activation-evidence-inspect','activation-evidence-generate'])('routes supported operation %s into host attestation',async operation=>{
  await expect(caller.runSealedRealmsProductionLinuxOperation({operation,workflowInputSha:'a'.repeat(40)} as never)).rejects.toMatchObject({phase:'runtime'});
 });
 it('refuses caller-selected dispatch dependencies',async()=>{
  await expect(caller.runSealedRealmsProductionLinuxOperation({operation:'preflight',workflowInputSha:'a'.repeat(40),factory:()=>({})} as never)).rejects.toMatchObject({phase:'input'});
 });
});
