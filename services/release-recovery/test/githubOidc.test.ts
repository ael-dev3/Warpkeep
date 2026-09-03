import { describe, expect, it } from 'vitest'
import { base64UrlEncode } from '../src/protocol.js'
import { verifyGitHubWorkflowIdentity } from '../src/githubOidc.js'
const text = new TextEncoder(); const commit = 'a'.repeat(40); const now = 1_700_000_000
async function signedFixture() {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey)
  const head = base64UrlEncode(text.encode('{"alg":"RS256","kid":"fixture","typ":"JWT"}'))
  const claims = { iss:'https://token.actions.githubusercontent.com',aud:'warpkeep-release-recovery',sub:'repo:ael-dev3/Warpkeep:environment:github-pages',repository:'ael-dev3/Warpkeep',repository_id:'1273513252',repository_owner_id:'183124839',ref:'refs/heads/main',sha:commit,ref_protected:'true',workflow:'Deploy GitHub Pages',workflow_ref:'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',workflow_sha:commit,environment:'github-pages',event_name:'workflow_run',runner_environment:'github-hosted',check_run_id:'91',run_id:'41',run_attempt:'2',jti:'123e4567-e89b-42d3-a456-426614174000',iat:now-5,nbf:now-5,exp:now+60 }
  const payload = base64UrlEncode(text.encode(JSON.stringify(claims))); const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, text.encode(`${head}.${payload}`)))
  const token = `${head}.${payload}.${base64UrlEncode(sig)}`
  const fakeFetch = (async (v: string | URL | Request) => { const u=String(v); if(u.endsWith('openid-configuration')) return Response.json({issuer:'https://token.actions.githubusercontent.com',jwks_uri:'https://token.actions.githubusercontent.com/.well-known/jwks'}); if(u.endsWith('/jwks')) return Response.json({keys:[{kty:'RSA',alg:'RS256',use:'sig',kid:'fixture',n:pub.n,e:pub.e}]}); if(u.endsWith('/check-runs/91')) return Response.json({id:91,name:'deploy-recovery',head_sha:commit,repository:{full_name:'ael-dev3/Warpkeep'}}); throw Error('unexpected fake transport') }) as typeof globalThis.fetch
  return { token, fetch: fakeFetch }
}
describe('GitHub recovery OIDC identity', () => {
  it('rejects a missing signature verifier rather than trusting shaped OIDC claims', async () => { const f=await signedFixture(); await expect(verifyGitHubWorkflowIdentity({token:f.token,candidateCommit:commit,fetch:f.fetch,nowSeconds:now})).resolves.toMatchObject({pagesRunId:'41',pagesRunAttempt:'2',checkRunId:'91'}) })
  it('rejects a redirected discovery response before it can select a foreign JWKS', async () => { const f=await signedFixture(); const redirect=(async()=>new Response(null,{status:302,headers:{location:'https://attacker.test'}})) as typeof fetch; await expect(verifyGitHubWorkflowIdentity({token:f.token,candidateCommit:commit,fetch:redirect,nowSeconds:now})).rejects.toThrowError('RECOVERY_GITHUB_OIDC_HTTP_INVALID') })
})
