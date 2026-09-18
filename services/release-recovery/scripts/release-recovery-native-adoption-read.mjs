import { readSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readSealedRealmsProductionNativeFixtureSources } from '../../../scripts/sealed-realms-production-linux-preflight.mjs';

async function main() {
  if (process.argv.length !== 2) throw Error('invalid');
  const input = Buffer.alloc(8192);
  let length = 0, token;
  try {
    for (;;) {
      const count = readSync(0, input, length, input.length - length, null);
      if (count === 0) break;
      length += count;
      if (length === input.length) throw Error('invalid');
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(input.subarray(0, length));
    const value = JSON.parse(text);
    if (`${JSON.stringify(value)}\n` !== text || JSON.stringify(Object.keys(value))
      !== JSON.stringify(['schemaVersion', 'profile', 'operatingCommit', 'githubToken']) || value.schemaVersion !== 1
      || value.profile !== 'warpkeep-release-recovery-native-adoption-read-v1'
      || typeof value.operatingCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(value.operatingCommit)) throw Error('invalid');
    if (value.githubToken !== null) {
      if (typeof value.githubToken !== 'string' || !/^[!-~]{20,4096}$/u.test(value.githubToken)) throw Error('invalid');
      token = Buffer.from(value.githubToken, 'ascii');
    }
    value.githubToken = null;
    return await readSealedRealmsProductionNativeFixtureSources({ operatingCommit: value.operatingCommit, githubToken: token ?? null });
  } finally { input.fill(0); token?.fill(0); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(value => process.stdout.write(`${JSON.stringify(value)}\n`)).catch(() => {
    process.stderr.write('RECOVERY_FIXTURE_INPUT_INVALID\n'); process.exitCode = 1;
  });
}
