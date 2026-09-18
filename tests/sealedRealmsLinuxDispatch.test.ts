// @vitest-environment node
// Executes the production dispatch body with explicit host/source/closure mocks.
// This fixture does not attest a native host, Git checkout, generated bundle or provider.
import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const stateKey='__warpkeepLinuxDispatchFixture';
const privateFailure='private-provider-fixture-detail';
async function fixture(operation: string, failure?: string) {
 const observation = operation === 'ptr-state-inspect';
 const ptr = observation || operation === 'ptr-update-inspect' || operation === 'ptr-update-apply';
 const g002 = operation === 'g002-update-inspect' || operation === 'g002-update-apply';
 const g001 = operation === 'preflight' || operation === 'g001-policy-observe';
 const lane = ptr ? 'ptr' : g002 ? 'g002' : g001 ? 'g001' : 'activation';
 const status = observation ? 'state-inspected' : operation === 'preflight' ? 'preflight-inspected'
  : operation === 'ptr-update-inspect' || operation === 'g002-update-inspect' ? 'update-inspected'
  : operation === 'activation-evidence-inspect' ? 'activation-evidence-inspected' : 'completed';
 vi.stubEnv('WARPKEEP_OPERATION',operation);vi.stubEnv('GITHUB_JOB',failure==='job'?'wrong-job':observation?'observe_ptr':ptr?'operate_ptr':g002?'operate_g002':operation.endsWith('generate')?'operate':'operate_readonly');
 const calls: string[]=[];
 const laneName = ptr ? 'Ptr' : g002 ? 'G002' : g001 ? 'G001' : 'Activation';
 const factory=`createSealedRealmsProduction${laneName}WorkflowRuntime`;
 const run=`runSealedRealmsProduction${laneName}Operation`;
 const runtime=Object.freeze({});
 const injectedFailure=()=>{throw Object.assign(new Error(privateFailure),{code:privateFailure,cause:new Error(privateFailure),phase:privateFailure});};
 const state={calls,selected:{path:'scripts/fixed.bundle.mjs',factoryExport:factory,exportNames:[factory,run]},loaded:{
  [factory]:async(input: unknown)=>{calls.push('factory');expect(input).toEqual({operation,workflowInputSha:'a'.repeat(40)});if(failure==='factory')injectedFailure();return runtime;},
  [run]:async(input: {runtime: unknown})=>{calls.push('run');expect(input).toEqual({runtime,operation,workflowInputSha:'a'.repeat(40)});if(failure==='run')injectedFailure();return {operation:failure==='operation'?'preflight':operation,status:failure==='result'?'unexpected':status};}
 }};
 if(failure==='exports')Object.assign(state.loaded,{extra:true});
 (globalThis as Record<string,unknown>)[stateKey]=state;
 let source=readFileSync(resolve('scripts/sealed-realms-production-linux-preflight.mjs'),'utf8');
 function substitute(start: string,end: string,body: string){const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<0)throw Error('fixture shape changed');source=source.slice(0,a)+body+'\n'+source.slice(b);}
 substitute('function runtime(expected, retainedRead = false)', 'function git(args',`function runtime(){globalThis.${stateKey}.calls.push('runtime');return {};}`);
 substitute('function source(commit)', 'function jsonFile(',`function source(){globalThis.${stateKey}.calls.push('source');return process.cwd();}`);
 substitute('function bundle(commit, lane)', '/** Fixed Linux operating caller',`function bundle(commit,lane){if(lane!==${JSON.stringify(lane)})throw Error('wrong lane');globalThis.${stateKey}.calls.push('bundle');return globalThis.${stateKey}.selected;}`);
 const stub=`export function verifyAuthBridgeNotificationPreparedDeployClosure(){globalThis.${stateKey}.calls.push('closure');return {};};export async function importAuthBridgeNotificationPreparedAttestedModules(){globalThis.${stateKey}.calls.push('import');return [globalThis.${stateKey}.loaded];}`;
 source=source.replaceAll("'./auth-bridge-notification-prepared-deploy-closure.mjs'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(stub).toString('base64')));
 source=source.replace(/(['"])(\.\/[^'"]+)\1/g,(_all,_quote,path)=>JSON.stringify(pathToFileURL(resolve('scripts',path)).href));
 const module=await import(/* @vite-ignore */ 'data:text/javascript;base64,'+Buffer.from(source+'\n//'+Math.random()).toString('base64'));
 try {return {result:await module.runSealedRealmsProductionLinuxOperation({operation,workflowInputSha:'a'.repeat(40)}),calls};}
 finally {
  vi.unstubAllEnvs();delete (globalThis as Record<string,unknown>)[stateKey];
  if(failure==='job')expect(calls).toEqual([]);
  if(failure==='factory'){expect(calls.at(-1)).toBe('factory');expect(calls).not.toContain('run');}
  if(failure==='run')expect(calls.at(-1)).toBe('run');
 }
}
it.each([
 ['preflight','preflight-inspected'],
 ['g001-policy-observe','completed'],
 ['ptr-state-inspect','state-inspected'],
 ['activation-evidence-inspect','activation-evidence-inspected'],
 ['activation-evidence-generate','completed'],
 ['ptr-update-inspect','update-inspected'],
 ['ptr-update-apply','completed'],
 ['g002-update-inspect','update-inspected'],
 ['g002-update-apply','completed'],
])('dispatches %s through fixed factory, opaque runtime and reattestation',async (operation,status)=>{
 const result=await fixture(operation);expect(result.result).toEqual({operation,status});
 expect(result.calls).toEqual(['runtime','source','bundle','closure','import','runtime','source','bundle','factory','runtime','source','bundle','run','runtime','source','bundle']);
});
it('refuses an extra export before calling the factory',async()=>{await expect(fixture('activation-evidence-inspect','exports')).rejects.toMatchObject({phase:'bundle'});});
it('refuses a malformed operation result',async()=>{await expect(fixture('activation-evidence-generate','result')).rejects.toMatchObject({phase:'result'});});

it('rejects mismatched workflow job before the mocked host or authority is reached',async()=>{await expect(fixture('activation-evidence-generate','job')).rejects.toMatchObject({phase:'runtime'});});
it.each(['ptr-state-inspect','ptr-update-inspect','ptr-update-apply','g002-update-inspect','g002-update-apply'])('rejects a wrong job for %s before host work',async operation=>{
 await expect(fixture(operation,'job')).rejects.toMatchObject({phase:'runtime'});
});
it.each(['result','operation'])('rejects mismatched PTR completion %s',async failure=>{
 await expect(fixture('ptr-update-apply',failure)).rejects.toMatchObject({phase:'result'});
});
it.each(['result','operation','exports'])('rejects mismatched PTR observation %s',async failure=>{
 await expect(fixture('ptr-state-inspect',failure)).rejects.toMatchObject({phase:failure==='exports'?'bundle':'result'});
});
it.each(['result','operation','exports'])('rejects mismatched G002 completion %s',async failure=>{
 await expect(fixture('g002-update-apply',failure)).rejects.toMatchObject({phase:failure==='exports'?'bundle':'result'});
});
it.each([
 ['factory','workflow'],
 ['run','operation'],
])('reports sanitized %s failures at their actual stage',async (failure,phase)=>{
 await fixture('g002-update-apply',failure).then(()=>expect.fail('Expected fixed operation failure'),error=>{
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toBe('SEALED_REALMS_LINUX_PREFLIGHT_FAILED');
  expect(error.phase).toBe(phase);
  expect(Object.keys(error)).toEqual(['phase']);
  expect(error.cause).toBeUndefined();
  expect(error.stack).not.toContain(privateFailure);
  expect(JSON.stringify(error)).not.toContain(privateFailure);
 });
});

it.each(['valid', 'extra-input', 'changed-after-import', 'extra-export'])('keeps desktop retained read %s outside workflow dispatch', async scenario => {
 const calls: string[]=[];const runtime=Object.freeze({});const token=Buffer.from('synthetic-token-'+ 'x'.repeat(32));
 const readName='readSealedRealmsProductionRetainedFixtureSources';
 const names=['createSealedRealmsProductionActivationWorkflowRuntime',readName,'runSealedRealmsProductionActivationOperation'];
 const state={calls,selected:{path:'scripts/fixed.bundle.mjs',exportNames:names},loaded:{
  [names[0]]:()=>{throw Error('desktop read reached effect factory');},
  [names[2]]:()=>{throw Error('desktop read reached effect run');},
  [readName]:async(input: unknown)=>{calls.push('read');expect(input).toEqual({operatingCommit:'a'.repeat(40),githubToken:token});return {safe:true};}
 }};
 if(scenario==='extra-export')Object.assign(state.loaded,{extra:()=>{}});
 (globalThis as Record<string,unknown>)[stateKey]=state;
 let source=readFileSync(resolve('scripts/sealed-realms-production-linux-preflight.mjs'),'utf8');
 const a=source.indexOf('export function createSealedRealmsProductionRetainedFixtureRuntime(input)'),b=source.indexOf('export async function readSealedRealmsProductionNativeFixtureSources(input)',a);
 expect(a).toBeGreaterThan(0);expect(b).toBeGreaterThan(a);
 source=source.slice(0,a)+`export function createSealedRealmsProductionRetainedFixtureRuntime(input){globalThis.${stateKey}.calls.push('create');const cap=Object.freeze({});retainedReadRuntimes.set(cap,{commit:input.operatingCommit,selected:globalThis.${stateKey}.selected});return cap;}\nexport function attestSealedRealmsProductionRetainedFixtureRuntime(cap){globalThis.${stateKey}.calls.push('attest');if(${JSON.stringify(scenario)}==='changed-after-import')throw Error('changed');}\n`+source.slice(b);
 const stub=`export function verifyAuthBridgeNotificationPreparedDeployClosure(){globalThis.${stateKey}.calls.push('closure');return {};};export async function importAuthBridgeNotificationPreparedAttestedModules(){globalThis.${stateKey}.calls.push('import');return [globalThis.${stateKey}.loaded];}`;
 source=source.replaceAll("'./auth-bridge-notification-prepared-deploy-closure.mjs'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(stub).toString('base64')));
 source=source.replace(/(['"])(\.\/[^'"]+)\1/g,(_all,_quote,path)=>JSON.stringify(pathToFileURL(resolve('scripts',path)).href));
 const module=await import(/* @vite-ignore */ 'data:text/javascript;base64,'+Buffer.from(source+'\n//desktop-'+Math.random()).toString('base64'));
 try {
  const input={operatingCommit:'a'.repeat(40),githubToken:token,...(scenario==='extra-input'?{operation:'activation-evidence-generate'}:{})};
  if(scenario==='valid'){
   await expect(module.readSealedRealmsProductionNativeFixtureSources(input)).resolves.toEqual({safe:true});
   expect(calls).toEqual(['create','closure','import','attest','read','attest']);
  }else{
   await expect(module.readSealedRealmsProductionNativeFixtureSources(input)).rejects.toThrow();
   expect(calls).not.toContain('read');if(scenario==='extra-input')expect(calls).toEqual([]);
  }
 }finally{delete (globalThis as Record<string,unknown>)[stateKey];token.fill(0);}
});
