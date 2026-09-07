import assert from 'node:assert/strict';
assert.equal(process.version, 'v22.22.3');
assert.equal(process.getuid(), 1001);
assert.equal(process.env.HTTPS_PROXY, 'http://172.30.240.2:3128');
assert.equal(process.env.NO_PROXY, '');
const response = await fetch('https://api.github.com', {
  method: 'HEAD', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(10000),
});
assert.equal(response.status, 200);
for (const url of ['https://example.com', 'https://127.0.0.1', 'https://169.254.169.254']) {
  await assert.rejects(fetch(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(10000) }));
}
process.stdout.write(JSON.stringify({ pinnedNodeProxyFetch: true, githubStatus: 200, forbiddenTargetsDenied: 3 }) + '\n');
