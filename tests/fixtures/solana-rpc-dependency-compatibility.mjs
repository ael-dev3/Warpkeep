// Real installed package imports with synthetic transport; no wallet, account,
// credentials, signing, or network requests. Run with node --test.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { Connection, PublicKey } from '@solana/web3.js';

const require = createRequire(import.meta.url);
const solanaRequire = createRequire(require.resolve('@solana/web3.js'));
const BrowserClient = solanaRequire('jayson/lib/client/browser');

test('Solana resolves the reviewed compatible Jayson pin', () => {
  assert.equal(solanaRequire('jayson/package.json').version, '4.1.3');
});

test('actual Mini App SDK imports without starting an owner session', async () => {
  const { sdk } = await import('@farcaster/miniapp-sdk');
  assert.equal(typeof sdk.actions.ready, 'function');
  assert.equal(typeof sdk.quickAuth.getToken, 'function');
});

test('Solana sends a JSON-RPC request and accepts the validated balance response', async () => {
  let calls = 0;
  const connection = new Connection('https://rpc.invalid', {
    fetch: async (url, options) => {
      calls++;
      assert.equal(String(url), 'https://rpc.invalid');
      const request = JSON.parse(options.body);
      assert.equal(request.jsonrpc, '2.0');
      assert.equal(request.method, 'getBalance');
      assert.equal(request.params[0], '11111111111111111111111111111111');
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id,
        result: { context: { slot: 123 }, value: 42 } }), { status: 200 });
    },
  });
  assert.equal(await connection.getBalance(new PublicKey('11111111111111111111111111111111')), 42);
  assert.equal(calls, 1);
});

test('browser RPC reports malformed JSON once without a successful response', () => {
  let calls = 0;
  const client = new BrowserClient((_request, callback) => callback(null, '{invalid'));
  client.request('getBalance', [], (error, response) => {
    calls++;
    assert.ok(error instanceof SyntaxError);
    assert.equal(response, undefined);
  });
  assert.equal(calls, 1);
});

test('browser RPC preserves server errors and request correlation', () => {
  let calls = 0;
  const client = new BrowserClient((raw, callback) => {
    const request = JSON.parse(raw);
    callback(null, JSON.stringify({ jsonrpc: '2.0', id: request.id,
      error: { code: -32602, message: 'Invalid params' } }));
  });
  client.request('getBalance', [], 'test-request', (error, response) => {
    calls++;
    assert.equal(error, null);
    assert.deepEqual(response, { jsonrpc: '2.0', id: 'test-request',
      error: { code: -32602, message: 'Invalid params' } });
  });
  assert.equal(calls, 1);
});
