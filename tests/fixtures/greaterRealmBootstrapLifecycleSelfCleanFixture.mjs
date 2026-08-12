import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  greaterRealmProductionBootstrapTestSeams,
  parseGreaterRealmProductionBootstrapArguments,
} from '../../scripts/greater-realm-production-bootstrap.mjs';

let interrupted = false;
process.on('SIGTERM', () => {
  interrupted = true;
  process.stdout.write('SIGNAL\n');
});
process.stdout.write(`READY ${process.pid}\n`);

let inputBytes = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) inputBytes += chunk;

try {
  const arguments_ = JSON.parse(inputBytes);
  const input = parseGreaterRealmProductionBootstrapArguments(arguments_);
  const complete = greaterRealmProductionBootstrapTestSeams.parseLaunchRecord(
    JSON.parse(readFileSync(join(input.runRoot, 'launch-record.json'), 'utf8')),
  );
  const outcome = await greaterRealmProductionBootstrapTestSeams.cleanupCompletedRun(
    input,
    complete,
  );
  process.stdout.write(`RESULT ${JSON.stringify({ outcome, interrupted })}\n`);
} catch (error) {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
}
