import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AuthBridgeNotificationPreparedReceiptError,
  inspectPrivateAuthBridgeNotificationPreparedReceipt,
} from './auth-bridge-notification-prepared-receipt.mjs';

const RECEIPT_PATH_ENVIRONMENT =
  'WARPKEEP_AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_PATH';
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(code) {
  throw new AuthBridgeNotificationPreparedReceiptError(code);
}

function readPrivateReceiptPath(environment) {
  const value = environment[RECEIPT_PATH_ENVIRONMENT];
  delete environment[RECEIPT_PATH_ENVIRONMENT];
  if (
    typeof value !== 'string'
    || value.length < 1
    || Buffer.byteLength(value, 'utf8') > 4 * 1_024
    || /[\0\r\n]/u.test(value)
  ) fail('AUTH_BRIDGE_PREPARED_RECEIPT_PATH_ENVIRONMENT_INVALID');
  return value;
}

async function main() {
  if (process.argv.length !== 2) {
    fail('AUTH_BRIDGE_PREPARED_VERIFIER_ARGUMENT_REJECTED');
  }
  const receiptPath = readPrivateReceiptPath(process.env);
  await inspectPrivateAuthBridgeNotificationPreparedReceipt({
    receiptPath,
    repositoryRoot,
  });
  console.log('auth bridge notification preparation: fresh private receipt verified');
}

main().catch(error => {
  console.error(error instanceof AuthBridgeNotificationPreparedReceiptError
    ? error.code
    : 'AUTH_BRIDGE_PREPARED_VERIFICATION_FAILED');
  process.exitCode = 1;
});
