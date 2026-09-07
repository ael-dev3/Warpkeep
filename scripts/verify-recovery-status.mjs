import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { RECOVERY_KEY_ID } from './recovery-public-key.mjs';
import { verifyRecoverySignedPayload } from './recovery-authorization-protocol.mjs';

const fail = () => { throw new Error('RECOVERY_STATUS_INVALID'); };
const integer = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);

/** Verifies a necessary status gate only; cannot authorize a deployment. No caller-selected key. */
export function verifyRecoveryStatus(...args) {
  try {
    const [compact, expectedEpoch, nowSeconds] = args;
    if (args.length !== 3 || typeof compact !== 'string' || compact.length > 16384
      || !integer(expectedEpoch) || expectedEpoch === 0 || !integer(nowSeconds)) fail();
    const payload = verifyRecoverySignedPayload(compact, 'status');
    if (payload.schemaVersion !== 1 || payload.profile !== 'warpkeep-0.4.0-recovery-status-v1'
      || payload.iss !== 'https://release-auth.warpkeep.com'
      || payload.aud !== 'warpkeep-0.4.0-sealed-launch'
      || payload.sub !== 'warpkeep-0.4.0-recovery-control-status'
      || payload.kid !== RECOVERY_KEY_ID || payload.enabled !== true
      || payload.authorizationEpoch !== expectedEpoch
      || !integer(payload.iat) || !integer(payload.exp) || payload.nbf !== payload.iat
      || payload.exp <= payload.iat || payload.exp - payload.iat > 60
      || nowSeconds < payload.iat || nowSeconds >= payload.exp) fail();
    return Object.freeze({ authorizationEpoch: expectedEpoch, issuedAt: payload.iat, expiresAt: payload.exp });
  } catch { fail(); }
}

export async function verifyRecoveryStatusFromStdin(...args) {
  const [input, expectedEpoch] = args;
  let timer;
  const bytes = Buffer.alloc(16384);
  let length = 0;
  try {
    if (args.length !== 2 || !(input instanceof Readable) || input.isTTY
      || input.destroyed || input.readableDidRead || input.readableEncoding
      || !integer(expectedEpoch) || expectedEpoch === 0) fail();
    timer = setTimeout(() => input.destroy(new Error('RECOVERY_STATUS_INVALID')), 5000);
    for await (const chunk of input) {
      try {
        if (!Buffer.isBuffer(chunk) || chunk.length > bytes.length - length) fail();
        chunk.copy(bytes, length);
        length += chunk.length;
      } finally { if (Buffer.isBuffer(chunk)) chunk.fill(0); }
    }
    const compact = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length));
    return verifyRecoveryStatus(compact, expectedEpoch, Math.floor(Date.now() / 1000));
  } catch { fail(); }
  finally {
    clearTimeout(timer);
    bytes.fill(0);
    if (input instanceof Readable) input.destroy();
  }
}

let direct = false;
try { direct = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* imported */ }
if (direct) {
  try {
    const argv = process.argv.slice(2);
    if (argv.length !== 2 || argv[0] !== '--epoch' || !/^[1-9][0-9]*$/u.test(argv[1])) fail();
    const epoch = Number(argv[1]);
    if (!Number.isSafeInteger(epoch) || String(epoch) !== argv[1]) fail();
    const result = await verifyRecoveryStatusFromStdin(process.stdin, epoch);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stdin.destroy();
    process.stderr.write('RECOVERY_STATUS_INVALID\n');
    process.exitCode = 1;
  }
}
