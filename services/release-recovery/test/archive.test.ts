import { describe, expect, it } from 'vitest'
import { inspectPagesArtifact } from '../src/archive.js'
const e=new TextEncoder(); const b=(v:string)=>e.encode(v)
function oct(n:number,l:number){return b(n.toString(8).padStart(l-1,'0')+'\0')}
function entry(path:string, body:Uint8Array){const h=new Uint8Array(512);h.set(b(path));h.set(oct(0o644,8),100);h.set(oct(body.length,12),124);h[156]=48;h.set(b('ustar\0'),257);h.set(b('00'),263);h.set(b('        '),148);let s=0;for(const x of h)s+=x;h.set(oct(s,8),148);const r=new Uint8Array(512+Math.ceil(body.length/512)*512);r.set(h);r.set(body,512);return r}
function zip(name:string,body:Uint8Array){const n=b(name),r=new Uint8Array(30+n.length+body.length),v=new DataView(r.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(18,body.length,true);v.setUint32(22,body.length,true);v.setUint16(26,n.length,true);r.set(n,30);r.set(body,30+n.length);return r}
describe('Pages recovery archive validator',()=>{
  it('rejects a changed outer member name rather than accepting an ambiguous ZIP',async()=>{await expect(inspectPagesArtifact(new Response(zip('other.tar',new Uint8Array(1024))))).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')})
  it('rejects a TAR traversal path before any content digest is trusted',async()=>{const tar=new Uint8Array([...entry('../x',b('x')),...new Uint8Array(1024)]);await expect(inspectPagesArtifact(new Response(zip('artifact.tar',tar)))).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')})
})
