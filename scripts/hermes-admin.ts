import { DbConnection } from '../src/spacetime/module_bindings';

type Command = 'seed-world' | 'allow-fid' | 'disable-fid' | 'bump-auth-epoch' | 'inspect-alpha';

const DEFAULT_DATABASE = 'warpkeep-89e4u';
const DEFAULT_URI = 'https://maincloud.spacetimedb.com';
const DEFAULT_BRIDGE = 'https://auth.warpkeep.com';
const CONNECT_TIMEOUT_MS = 10_000;
const OPERATION_TIMEOUT_MS = 15_000;

function fail(message: string): never {
  throw new Error(message);
}

function readHttpsUrl(value: string | undefined, label: string) {
  if (!value) fail(`${label} is required.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.hostname.endsWith('.invalid')) {
    fail(`${label} must be a stable public HTTPS base URL.`);
  }
  return url.pathname === '/' ? url.origin : url.toString().replace(/\/$/, '');
}

function readDatabase(value: string | undefined) {
  const database = value || DEFAULT_DATABASE;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(database)) {
    fail('WARPKEEP_SPACETIMEDB_DATABASE is invalid.');
  }
  return database;
}

function readFid(value: string | undefined) {
  if (!value || !/^[1-9][0-9]{0,15}$/.test(value)) {
    fail('A positive, JavaScript-safe decimal FID is required.');
  }
  const fid = BigInt(value);
  if (fid > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('FID exceeds the supported safe range.');
  }
  return fid;
}

function sanitizeNote(value: string | undefined, fallback?: string) {
  const note = (value ?? fallback ?? '').trim();
  if (!note || note.length > 512) fail('A non-empty note of at most 512 characters is required.');
  return note;
}

function commandFrom(value: string | undefined): Command {
  if (
    value === 'seed-world'
    || value === 'allow-fid'
    || value === 'disable-fid'
    || value === 'bump-auth-epoch'
    || value === 'inspect-alpha'
  ) {
    return value;
  }
  fail('Usage: hermes-admin.ts <seed-world|allow-fid|disable-fid|bump-auth-epoch|inspect-alpha> [...args] [--dry-run] [--confirm]');
}

function printable(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(printable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, printable(entry)]));
  }
  return value;
}

async function requestAdminToken(bridgeUrl: string, secret: string) {
  let response: Response;
  try {
    response = await fetch(new URL('v1/admin/token', `${bridgeUrl}/`), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        accept: 'application/json',
        'cache-control': 'no-store',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    fail('Could not reach the Warpkeep admin bridge.');
  }
  if (!response.ok) fail('The Warpkeep admin bridge rejected the request.');
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    fail('The Warpkeep admin bridge returned an invalid response.');
  }
  if (
    !body
    || typeof body !== 'object'
    || typeof (body as { token?: unknown }).token !== 'string'
    || (body as { tokenType?: unknown }).tokenType !== 'spacetime-access'
  ) {
    fail('The Warpkeep admin bridge returned an invalid session.');
  }
  return (body as { token: string }).token;
}

function requireCredentialedProductionTarget(uri: string, database: string, bridgeUrl: string): void {
  if (uri !== DEFAULT_URI || database !== DEFAULT_DATABASE || bridgeUrl !== DEFAULT_BRIDGE) {
    fail('Credentialed Hermes commands require the canonical Warpkeep production targets.');
  }
}

function withOperationTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Warpkeep database operation timed out.')), OPERATION_TIMEOUT_MS);
  });
  return Promise.race([operation, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function connect(uri: string, database: string, token: string): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (callback: () => void) => {
      if (settled) return false;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      callback();
      return true;
    };
    timer = setTimeout(() => {
      settle(() => reject(new Error('Could not connect to the Warpkeep database.')));
    }, CONNECT_TIMEOUT_MS);
    try {
      DbConnection.builder()
        .withUri(uri)
        .withDatabaseName(database)
        .withToken(token)
        .onConnect((connection) => {
          if (!settle(() => resolve(connection))) connection.disconnect();
        })
        .onConnectError(() => settle(() => reject(new Error('Could not connect to the Warpkeep database.'))))
        .build();
    } catch {
      settle(() => reject(new Error('Could not connect to the Warpkeep database.')));
    }
  });
}

async function readStatus(connection: DbConnection, machineReadable = false) {
  const status = await withOperationTimeout(connection.procedures.adminGetAlphaStatus({}));
  if (machineReadable) {
    // Keep the verifier contract deliberately narrow: it needs aggregate
    // activation state, never audit records, targets, identities, or tokens.
    console.log(JSON.stringify(printable({
      worldTiles: status.worldTiles,
      allowedFids: status.allowedFids,
      enabledAllowedFids: status.enabledAllowedFids,
      players: status.players,
      castles: status.castles,
    })));
    return;
  }
  console.log(JSON.stringify(printable(status)));
}

async function main() {
  const positional = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
  const command = commandFrom(positional[0]);
  const dryRun = process.argv.includes('--dry-run');
  const machineReadableInspection = command === 'inspect-alpha' && process.argv.includes('--json');
  const confirmed = process.argv.includes('--confirm') || process.env.WARPKEEP_HERMES_NONINTERACTIVE === 'yes';
  const mutation = command !== 'inspect-alpha';
  const database = readDatabase(process.env.WARPKEEP_SPACETIMEDB_DATABASE);
  const uri = readHttpsUrl(process.env.WARPKEEP_SPACETIMEDB_URI || DEFAULT_URI, 'WARPKEEP_SPACETIMEDB_URI');

  const fid = command === 'allow-fid' || command === 'disable-fid' || command === 'bump-auth-epoch'
    ? readFid(positional[1])
    : undefined;
  const note = command === 'allow-fid' || command === 'disable-fid'
    ? sanitizeNote(positional[2])
    : command === 'bump-auth-epoch'
      ? sanitizeNote(positional[2], 'auth epoch rotation')
      : undefined;

  if (!machineReadableInspection) {
    console.log(`Warpkeep Hermes target: ${database} at ${uri}`);
  }
  if (dryRun) {
    console.log(JSON.stringify(printable({ command, fid, note, mutation, dryRun: true })));
    return;
  }
  if (mutation && !confirmed) {
    fail('Refusing mutation without --confirm (or WARPKEEP_HERMES_NONINTERACTIVE=yes).');
  }

  const bridgeUrl = readHttpsUrl(process.env.WARPKEEP_AUTH_BRIDGE_URL, 'WARPKEEP_AUTH_BRIDGE_URL');
  requireCredentialedProductionTarget(uri, database, bridgeUrl);
  const secret = process.env.WARPKEEP_ADMIN_TOKEN_SECRET;
  if (!secret) fail('WARPKEEP_ADMIN_TOKEN_SECRET is required.');
  const token = await requestAdminToken(bridgeUrl, secret);
  const connection = await connect(uri, database, token);
  try {
    if (command === 'seed-world') {
      await withOperationTimeout(connection.reducers.adminSeedWorld({}));
    } else if (command === 'allow-fid' && fid !== undefined && note !== undefined) {
      await withOperationTimeout(connection.reducers.adminAllowFid({ fid, note }));
    } else if (command === 'disable-fid' && fid !== undefined && note !== undefined) {
      await withOperationTimeout(connection.reducers.adminDisableFid({ fid, note }));
    } else if (command === 'bump-auth-epoch' && fid !== undefined && note !== undefined) {
      await withOperationTimeout(connection.reducers.adminBumpAuthEpoch({ fid, note }));
    }
    await readStatus(connection, machineReadableInspection);
  } finally {
    connection.disconnect();
  }
}

main().catch((error) => {
  // Error messages are intentionally generic and never include a bridge token,
  // secret, request body, or server response body.
  console.error(error instanceof Error ? error.message : 'Hermes command failed.');
  process.exitCode = 1;
});
