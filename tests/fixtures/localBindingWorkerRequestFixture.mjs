import { readLocalBindingWorkerRequest } from '../../scripts/local-binding-runtime-worker-request.mjs';

try {
  const request = readLocalBindingWorkerRequest();
  process.stdout.write(`${request.nonce}\n`);
} catch (error) {
  process.stderr.write(`${error?.code ?? error?.message ?? 'LOCAL_BINDING_WORKER_REQUEST_INVALID'}\n`);
  process.exitCode = 1;
}
