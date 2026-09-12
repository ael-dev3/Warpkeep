// @vitest-environment node
// Executes the production dispatch body with explicit host/source/closure mocks.
// This fixture does not attest a native host, Git checkout, generated bundle or provider.
import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const stateKey='__warpkeepLinuxDispatchFixture';
async function fixture(operation: string, failure?: string) {
 const ptr = operation === 'ptr-update-inspect' || operation === 'ptr-update-apply';
 const lane = ptr ? 'ptr' : 'activation';
 const status = operation === 'ptr-update-inspect' ? 'update-inspected'
  : operation === 'activation-evidence-inspect' ? 'activation-evidence-inspected' : 'completed';
 vi.stubEnv('WARPKEEP_OPERATION',operation);vi.stubEnv('GITHUB_JOB',failure==='job'?'wrong-job':ptr?'operate_ptr':operation.endsWith('generate')?'operate':'operate_readonly');
 const calls: string[]=[];
 const factory=ptr?'createSealedRealmsProductionPtrWorkflowRuntime':'createSealedRealmsProductionActivationWorkflowRuntime';
 const run=ptr?'runSealedRealmsProductionPtrOperation':'runSealedRealmsProductionActivationOperation';
 const runtime=Object.freeze({});
 const state={calls,selected:{path:'scripts/fixed.bundle.mjs',factoryExport:factory,exportNames:[factory,run]},loaded:{
  [factory]:async(input: unknown)=>{calls.push('factory');expect(input).toEqual({operation,workflowInputSha:'a'.repeat(40)});return runtime;},
  [run]:async(input: {runtime: unknown})=>{calls.push('run');expect(input).toEqual({runtime,operation,workflowInputSha:'a'.repeat(40)});return {operation:failure==='operation'?'preflight':operation,status:failure==='result'?'unexpected':status};}
 }};
 if(failure==='exports')Object.assign(state.loaded,{extra:true});
 (globalThis as Record<string,unknown>)[stateKey]=state;
 let source=readFileSync(resolve('scripts/sealed-realms-production-linux-preflight.mjs'),'utf8');
 function substitute(start: string,end: string,body: string){const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<0)throw Error('fixture shape changed');source=source.slice(0,a)+body+'\n'+source.slice(b);}
 substitute('function runtime(expected)', 'function git(args',`function runtime(){globalThis.${stateKey}.calls.push('runtime');return {};}`);
 substitute('function source(commit)', 'function jsonFile(',`function source(){globalThis.${stateKey}.calls.push('source');return process.cwd();}`);
 substitute('function bundle(commit, lane)', '/** Fixed Linux operating caller',`function bundle(commit,lane){if(lane!==${JSON.stringify(lane)})throw Error('wrong lane');globalThis.${stateKey}.calls.push('bundle');return globalThis.${stateKey}.selected;}`);
 const stub=`export function verifyAuthBridgeNotificationPreparedDeployClosure(){globalThis.${stateKey}.calls.push('closure');return {};};export async function importAuthBridgeNotificationPreparedAttestedModules(){globalThis.${stateKey}.calls.push('import');return [globalThis.${stateKey}.loaded];}`;
 source=source.replaceAll("'./auth-bridge-notification-prepared-deploy-closure.mjs'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(stub).toString('base64')));
 source=source.replace(/(['"])(\.\/[^'"]+)\1/g,(_all,_quote,path)=>JSON.stringify(pathToFileURL(resolve('scripts',path)).href));
 const module=await import(/* @vite-ignore */ 'data:text/javascript;base64,'+Buffer.from(source+'\n//'+Math.random()).toString('base64'));
 try {return {result:await module.runSealedRealmsProductionLinuxOperation({operation,workflowInputSha:'a'.repeat(40)}),calls};}
 finally {vi.unstubAllEnvs();delete (globalThis as Record<string,unknown>)[stateKey];if(failure==='job')expect(calls).toEqual([]);}
}
it.each([
 ['activation-evidence-inspect','activation-evidence-inspected'],
 ['activation-evidence-generate','completed'],
 ['ptr-update-inspect','update-inspected'],
 ['ptr-update-apply','completed'],
])('dispatches %s through fixed factory, opaque runtime and reattestation',async (operation,status)=>{
 const result=await fixture(operation);expect(result.result).toEqual({operation,status});
 expect(result.calls).toEqual(['runtime','source','bundle','closure','import','runtime','source','bundle','factory','runtime','source','bundle','run','runtime','source','bundle']);
});
it('refuses an extra export before calling the factory',async()=>{await expect(fixture('activation-evidence-inspect','exports')).rejects.toMatchObject({phase:'bundle'});});
it('refuses a malformed operation result',async()=>{await expect(fixture('activation-evidence-generate','result')).rejects.toMatchObject({phase:'result'});});

it('rejects mismatched workflow job before the mocked host or authority is reached',async()=>{await expect(fixture('activation-evidence-generate','job')).rejects.toMatchObject({phase:'runtime'});});
it.each(['ptr-update-inspect','ptr-update-apply'])('rejects a wrong job for %s before host work',async operation=>{
 await expect(fixture(operation,'job')).rejects.toMatchObject({phase:'runtime'});
});
it.each(['result','operation'])('rejects mismatched PTR completion %s',async failure=>{
 await expect(fixture('ptr-update-apply',failure)).rejects.toMatchObject({phase:'result'});
});
