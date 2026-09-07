import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

test('installed Solana and Mini App dependencies retain the reviewed RPC behavior', () => {
  const output = execFileSync(process.execPath,
    ['--test', resolve('tests/fixtures/solana-rpc-dependency-compatibility.mjs')],
    { encoding: 'utf8', timeout: 20_000 });
  expect(output).toContain('# pass 5');
  expect(output).toContain('# fail 0');
}, 25_000);
