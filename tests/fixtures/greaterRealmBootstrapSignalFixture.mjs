import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import { greaterRealmProductionBootstrapTestSeams } from
  '../../scripts/greater-realm-production-bootstrap.mjs';

const marker = process.argv[2];
if (typeof marker !== 'string') process.exit(64);

const controller = greaterRealmProductionBootstrapTestSeams.createSignalController();
const child = spawn('/bin/sh', [
  '-c',
  [
    'trap \'printf "terminal\\n" >>"$1"; exit 0\' INT TERM',
    'printf "started\\n" >>"$1"',
    'while :; do /bin/sleep 0.05; done',
  ].join('; '),
  'warpkeep-test-operator',
  marker,
], {
  detached: true,
  stdio: 'ignore',
});
if (!Number.isSafeInteger(child.pid) || child.pid < 2) process.exit(65);
controller.bindGroup(child.pid);
process.stdout.write('READY\n');
const result = await new Promise((resolvePromise, rejectPromise) => {
  child.once('error', rejectPromise);
  child.once('close', (code, signal) => resolvePromise({ code, signal }));
});
controller.unbindGroup(child.pid);
controller.dispose();
appendFileSync(marker, `bootstrap-terminal:${result.code}:${result.signal}\n`);
process.exit(result.code === 0 && result.signal === null ? 0 : 1);
