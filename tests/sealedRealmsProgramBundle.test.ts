// @vitest-environment node
import { it, expect } from 'vitest';
import { build } from 'esbuild';
import { realpathSync, mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildSealedRealmOperationBundle } from '../scripts/sealed-realms-production-bundle-engine.mjs';
it('builds the native-program activation graph and retains checkout identity in transformed runtime expressions', async () => {
 const sourceRoot=process.cwd();const transformed=new Map();
 const artifact=await buildSealedRealmOperationBundle({lane:'activation',sourceRoot,build:async options=>{
  const plugin=options.plugins![0];const setup=plugin.setup;
  plugin.setup=api=>setup({...api,onLoad(filter,callback){api.onLoad(filter,async args=>{const result=await callback(args);transformed.set(args.path,result?.contents);return result;});}});
  return build(options);
 }});
 const core=transformed.get(join(sourceRoot,'scripts/local-binding-runtime-core.mjs'));
 const capability=transformed.get(join(sourceRoot,'scripts/sealed-realms-production-recovery-program-artifacts.mjs'));
 const coreExpression=core.match(/const repositoryRoot = ([^;]+);/)[1];
 const capExpression=capability.match(/(realpathSync\([^\n]+\)) !== state.root/)[1];
 expect(Function(`return ${coreExpression}`)()).toBe(sourceRoot);
 expect(Function('realpathSync',`return ${capExpression}`)(realpathSync)).toBe(realpathSync(sourceRoot));
 const spec=core.match(/packages = await import\(([^;]+)\);/)[1];
 expect(Function(`return ${spec}`)()).toBe('warpkeep:operation-bundle-packages');
 const directory=mkdtempSync(join(tmpdir(),'warpkeep-program-bundle-'));
 try {
  const output=join(directory,artifact.basename);writeFileSync(output,artifact.bytes);
  const child=spawnSync(process.execPath,['--input-type=module','--eval',`const m=await import(${JSON.stringify(pathToFileURL(output).href)});try{await m.createSealedRealmsProductionActivationWorkflowRuntime({});throw Error('accepted');}catch(e){if(e.code!=='SEALED_REALMS_ACTIVATION_WORKFLOW_INPUT_INVALID')throw e;}`],{cwd:sourceRoot,encoding:'utf8',timeout:30000,windowsHide:true});
  expect({status:child.status,stderr:child.stderr}).toEqual({status:0,stderr:''});
 } finally {rmSync(directory,{recursive:true,force:true});}
},60000);

it('refuses drift in the fixed native checkout expression', async () => {
 const directory=mkdtempSync(join(tmpdir(),'warpkeep-program-drift-'));
 try {
  mkdirSync(join(directory,'scripts'));
  const path=join(directory,'scripts/local-binding-runtime-core.mjs');
  writeFileSync(path,readFileSync(resolve('scripts/local-binding-runtime-core.mjs'),'utf8')
   .replace("resolve(dirname(fileURLToPath(import.meta.url)), '..')", "resolve(dirname(fileURLToPath(import.meta.url)), '../..')"));
  await expect(buildSealedRealmOperationBundle({lane:'activation',sourceRoot:directory,build:async options=>{
   let generic: ((args: {path: string}) => unknown) | undefined;
   options.plugins![0].setup({onLoad(filter: {filter: RegExp},callback: typeof generic){if(filter.filter.test(path))generic=callback;}} as never);
   if(!generic)throw Error('missing transformation');
   generic({path});throw Error('accepted changed source');
  }})).rejects.toMatchObject({code:'SEALED_REALMS_BUNDLES_SOURCE_INVALID'});
 } finally {rmSync(directory,{recursive:true,force:true});}
});
