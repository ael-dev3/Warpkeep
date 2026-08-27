import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { G001_BASELINE, G001_BASELINE_ABI_SHA256, G001_FREEZE_NONCE, materializeGenesis001Frozen } from '../scripts/genesis001-frozen-materializer.mjs';

const roots:string[]=[];
afterEach(()=>roots.splice(0).forEach(path=>rmSync(path,{recursive:true,force:true})));

function allTypeScriptSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return allTypeScriptSources(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('Genesis 001 frozen historical lane',()=>{
  it('pins the exact live-matching source and immutable receipt',()=>{
    expect(G001_BASELINE).toBe('2ae51984e1fa6ce5b0028c1a250359fed79d819b');
    expect(G001_BASELINE_ABI_SHA256).toBe('cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03');
    expect(G001_FREEZE_NONCE).toMatch(/^[0-9a-f]{64}$/);
  });
  it('seals all six writers before authority or state access',()=>{
    const root=mkdtempSync(join(tmpdir(),'g001-test-')); roots.push(root); chmodSync(root,0o700);
    const destination=join(root,'materialized');
    materializeGenesis001Frozen({repoRoot:process.cwd(),destination});
    const adminPath=join(destination,'spacetimedb/src/reducers/admin.ts');
    const admin=readFileSync(adminPath,'utf8');
    const requests=readFileSync(join(destination,'spacetimedb/src/reducers/accessRequests.ts'),'utf8');
    for(const name of ['admin_allow_fid','admin_admit_founder_v1','admin_disable_fid','admin_bump_auth_epoch']) {
      const body=admin.slice(admin.indexOf(`{ name: '${name}' }`)); expect(body.indexOf('rejectGenesis001AdmissionMutation()')).toBeLessThan(body.indexOf('requireAdmin('));
    }
    let body=requests.slice(requests.indexOf("{ name: 'access_request_submit_v1' }")); expect(body.indexOf('rejectGenesis001AccessRequestSubmission()')).toBeLessThan(body.indexOf('requireAccessRequestResolver('));
    body=requests.slice(requests.indexOf("{ name: 'admin_reset_access_request_v1' }")); expect(body.indexOf('rejectGenesis001AdmissionMutation()')).toBeLessThan(body.indexOf('requireAdmin('));
    expect(requests).toContain("name: 'admin_get_access_request_reset_status_v1'");
    expect((admin.match(/rejectGenesis001AdmissionMutation\(\);/g)??[])).toHaveLength(4);
    expect((requests.match(/rejectGenesis001AccessRequestSubmission\(\);/g)??[])).toHaveLength(1);
    expect((requests.match(/rejectGenesis001AdmissionMutation\(\);/g)??[])).toHaveLength(1);

    const sourceDirectory = join(destination, 'spacetimedb/src');
    const mutations = new Map<string, number>();
    const mutationPattern = /\b(?:ctx|tx)\.db\.(allowedFid|accessRequestV1)(?:\.fid)?\.(insert|update|delete)\s*\(/g;
    for (const path of allTypeScriptSources(sourceDirectory)) {
      const text = readFileSync(path, 'utf8');
      for (const match of text.matchAll(mutationPattern)) {
        const key = `${relative(sourceDirectory, path)}:${match[1]}:${match[2]}`;
        mutations.set(key, (mutations.get(key) ?? 0) + 1);
      }
    }
    expect([...mutations.entries()].sort(([left], [right]) => left.localeCompare(right)))
      .toEqual([
        ['reducers/accessRequests.ts:accessRequestV1:delete', 1],
        ['reducers/accessRequests.ts:accessRequestV1:insert', 1],
        ['reducers/accessRequests.ts:accessRequestV1:update', 1],
        ['reducers/accessRequests.ts:allowedFid:update', 1],
        ['reducers/admin.ts:allowedFid:insert', 1],
        ['reducers/admin.ts:allowedFid:update', 4],
      ]);

    const policy=readFileSync(join(destination,'spacetimedb/src/genesis001FrozenPolicy.ts'),'utf8');
    expect(policy).toContain(`sourceBaselineCommit: '${G001_BASELINE}'`);
    expect(policy).toContain(`freezeReleaseNonce: '${G001_FREEZE_NONCE}'`);
    expect(policy).toContain('GENESIS_001_ACCESS_REQUEST_SUBMISSIONS_DISABLED');
    expect(policy).toContain('GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED');

    expect((lstatSync(destination).mode&0o777).toString(8)).toBe('700');
    expect((lstatSync(join(destination,'spacetimedb/src')).mode&0o777).toString(8)).toBe('700');
    expect((lstatSync(adminPath).mode&0o777).toString(8)).toBe('600');
    expect(lstatSync(adminPath).isSymbolicLink()).toBe(false);
  });

  it('requires a fresh destination beneath an owner-private directory',()=>{
    const root=mkdtempSync(join(tmpdir(),'g001-fresh-')); roots.push(root); chmodSync(root,0o700);
    const existing=join(root,'existing'); mkdirSync(existing,{mode:0o700});
    expect(()=>materializeGenesis001Frozen({repoRoot:process.cwd(),destination:existing}))
      .toThrow(/fresh destination/i);

    const publicRoot=join(root,'public'); mkdirSync(publicRoot,{mode:0o755});
    expect(()=>materializeGenesis001Frozen({repoRoot:process.cwd(),destination:join(publicRoot,'candidate')}))
      .toThrow(/owner-private/i);

    const occupied=join(root,'occupied'); writeFileSync(occupied,'not a directory');
    expect(()=>materializeGenesis001Frozen({repoRoot:process.cwd(),destination:occupied}))
      .toThrow(/fresh destination/i);
  });
});
