import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type CommandResult = { status: number | null; stdout?: string | Buffer; stderr?: string | Buffer; error?: NodeJS.ErrnoException };
type Execute = (file: string, args: string[], options: SpawnSyncOptionsWithStringEncoding) => CommandResult;
type Result = { ok: boolean; reason?: string; positives?: number; negatives?: number; missing?: string[]; unexpected?: string[]; identities?: string[] };

/** Independent historical public/test values, assembled to avoid creating new
 * credential-looking literals at this new source path. Never sign a new token or
 * generate a usable key. No fixture value is derived from the allowlist regex. */
function fixture() {
  const files = new Map<string, string>(); const expected: string[] = []; let positives = 0;
  const hashes = [
    ['5115095e2f8010c7', '5da052ecb1cfb3af', '630e084f0f8daa93', 'a863557b01b0f90a'].join(''),
    ['e31e1aa40a8331f0', '1d753cef475f7b9e', 'ab934fc25f5f0b36', '995bfd80bd66ad27'].join(''),
  ];
  const fid = ['private-fid-', '123456'].join('');
  const owner = ['secret-owner-fid-', '12345'].join('');
  const schema = ['g002Admission', 'MutationsEnabled'].join('');
  const thumbprint = ['jJpfIbYjQL5LxwND', '5zk1MUOqN1B3vOh_', 'ydTAOoUnuR8'].join('');
  const groups: Array<[string, string[]]> = [
    ['services/release-recovery/scripts/release-recovery-toolchain-records.mjs', hashes],
    ['services/release-recovery/scripts/prepare-release-recovery-wsl-toolchain.mjs', hashes],
    ['services/release-recovery/test/releaseRecoverySpacetimeFixtures.test.ts', hashes],
    ['services/release-recovery/test/realmEvidence.test.ts', [fid]],
    ['services/auth-bridge/test/releaseRecoveryObservation.test.ts', [owner]],
    ['services/release-recovery/src/githubEvidence.ts', [schema]],
    ['scripts/sealed-realms-production-activation-records.mjs', [schema]],
    ['services/release-recovery/src/recoveryPublicKey.ts', [thumbprint]],
    ['scripts/sealed-realms-production-activation-lane.bundle.mjs', [schema, thumbprint]],
    ['scripts/sealed-realms-production-g002-lane.bundle.mjs', [schema, thumbprint]],
    ['scripts/sealed-realms-production-ptr-lane.bundle.mjs', [schema, thumbprint]],
  ];
  for (const [path, values] of groups) {
    files.set(path, values.map((value, index) => `const API_KEY_${index} = '${value}';\nconst MUTATED_API_KEY_${index} = '${value.slice(0, -1)}b';\n`).join(''));
    values.forEach((_, index) => { positives++; expected.push(`generic-api-key:${path}:${index * 2 + 2}`); });
  }
  const wrongValues = [...hashes, fid, owner, schema, thumbprint];
  files.set('wrong-public-values.ts', wrongValues.map((value, index) => `const API_KEY_${index} = '${value}';\n`).join(''));
  wrongValues.forEach((_, index) => expected.push(`generic-api-key:wrong-public-values.ts:${index + 1}`));
  const rpc = ['AAECAwQFBgcICQoL', 'DA0ODxAREhMUFRYX', 'GBkaGxwdHh8'].join('');
  const rpcPath = 'services/auth-bridge/test/releaseRecoveryConfig.test.ts';
  files.set(rpcPath, `const RPC_CREDENTIAL = '${rpc}';\nconst OTHER_RPC_CREDENTIAL = '${rpc}x';\n`);
  files.set('wrong-path.ts', `const RPC_CREDENTIAL = '${rpc}';\n`);
  positives++; expected.push(`generic-api-key:${rpcPath}:2`, 'generic-api-key:wrong-path.ts:1');

  const header = { alg: 'ES256', typ: 'warpkeep-0.4.0-recovery-status+jwt', kid: 'warpkeep-0.4.0-recovery-2026-09-03-1' };
  const payload = { schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-status-v1', iss: 'https://release-auth.warpkeep.com',
    aud: 'warpkeep-0.4.0-sealed-launch', sub: 'warpkeep-0.4.0-recovery-control-status', kid: header.kid,
    enabled: true, authorizationEpoch: 7, iat: 1000, nbf: 1000, exp: 1060 };
  const signature = ['-KXyra7BGffHXoMv', 'csPr7lArwRAMOsgJ', '2YHidcQeEsRGnaXM', '2BFD9G9O-ri-OtNM', 'Vfxk20hcHfVTC1Yf', 'paVLgg'].join('');
  const status = [Buffer.from(JSON.stringify(header)).toString('base64url'), Buffer.from(JSON.stringify(payload)).toString('base64url'), signature].join('.');
  const jwtPath = 'services/release-recovery/test/crypto.test.ts';
  files.set(jwtPath, `const STATUS_JWS = '${status}';\nconst OTHER_STATUS_JWS = '${status.slice(0, -1)}A';\n`);
  files.set('wrong-jwt.ts', `const STATUS_JWS = '${status}';\n`);
  positives++; expected.push(`jwt:${jwtPath}:2`, 'jwt:wrong-jwt.ts:1');

  const begin = ['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' '); const end = ['-----END RSA', 'PRIVATE KEY-----'].join(' ');
  const malformed = (body: string) => `'${begin}\\n${body}\\n${end}',\n      \`${begin}\`;\n`;
  const keyPath = 'services/release-recovery/test/githubEvidence.test.ts';
  files.set(keyPath, `${malformed('AAAA')}\n${malformed('BBBB')}`);
  files.set('wrong-key.ts', malformed('AAAA'));
  positives++; expected.push(`private-key:${keyPath}:4`, 'private-key:wrong-key.ts:1');
  return { files, expected: expected.sort(), positives };
}

/** Runs only disposable synthetic input. Caller supplies the already verified
 * scanner binary; CI verifies its archive SHA before invoking this entry. */
export function runScannerRegression({ scanner, config, tempParent = tmpdir(), timeoutMs = 45000, execute = spawnSync }: {
  scanner: string; config: string; tempParent?: string; timeoutMs?: number; execute?: Execute;
}): Result {
  const parent = realpathSync(tempParent); const owned = mkdtempSync(join(parent, 'warpkeep-scanner-regression-'));
  const working = join(owned, 'fixture'); mkdirSync(working); mkdirSync(join(owned, 'hooks'));
  const emptyConfig = join(owned, 'gitconfig'); writeFileSync(emptyConfig, '');
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
    TEMP: owned, TMP: owned, TMPDIR: owned, LANG: 'C.UTF-8', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfig };
  const options: SpawnSyncOptionsWithStringEncoding = { cwd: working, env, encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL', maxBuffer: 1048576, windowsHide: true };
  try {
    const scannerOptions = { ...options, timeout: timeoutMs };
    const version = execute(scanner, ['version'], scannerOptions);
    if (version.error || version.status !== 0 || String(version.stdout).trim() !== '8.30.1') return { ok: false, reason: 'scanner-version' };
    const { files, expected, positives } = fixture();
    for (const [path, content] of files) { const target = join(working, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, content); }
    const git = (args: string[]) => execute('git', ['-c', `core.hooksPath=${join(owned, 'hooks')}`, '-c', 'commit.gpgsign=false',
      '-c', 'user.name=Scanner regression', '-c', 'user.email=scanner@example.invalid', ...args], options);
    for (const args of [['init', '--quiet'], ['add', '--all'], ['commit', '--quiet', '-m', 'Synthetic scanner regression']]) {
      const result = git(args); if (result.error || result.status !== 0) return { ok: false, reason: 'fixture-git-failed' };
    }
    const scan = execute(scanner, ['git', '--config', resolve(config), '--redact', '--no-banner', '--no-color', '--log-level', 'fatal',
      '--report-format', 'json', '--report-path', '-', '--timeout=30', working], scannerOptions);
    if (scan.error?.code === 'ETIMEDOUT') return { ok: false, reason: 'scanner-timeout' };
    if (scan.error || (scan.status !== 0 && scan.status !== 1)) return { ok: false, reason: 'scanner-failed' };
    let report: unknown;
    try { report = JSON.parse(String(scan.stdout)); } catch { return { ok: false, reason: 'invalid-report' }; }
    if (!Array.isArray(report) || report.some(item => !item || typeof item.RuleID !== 'string' || typeof item.File !== 'string' || !Number.isInteger(item.StartLine) || item.StartLine < 1)) return { ok: false, reason: 'invalid-report' };
    // Return identities only: scanner Match/Secret/source text never reaches logs.
    const identities = report.map(item => `${item.RuleID}:${item.File}:${item.StartLine}`).sort();
    const missing = expected.filter(item => !identities.includes(item)); const unexpected = identities.filter(item => !expected.includes(item));
    if (missing.length || unexpected.length || new Set(identities).size !== identities.length || scan.status !== 1) {
      return { ok: false, reason: 'finding-mismatch', missing, unexpected };
    }
    return { ok: true, positives, negatives: identities.length, identities };
  } catch { return { ok: false, reason: 'scanner-regression-failed' }; }
  finally {
    // Never recursively remove an unresolved broad path or a replaced symlink.
    if (lstatSync(owned).isSymbolicLink() || dirname(realpathSync(owned)) !== parent) throw new Error('Owned scanner fixture changed; cleanup refused');
    rmSync(owned, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [scanner, config = '.gitleaks.toml', ...extra] = process.argv.slice(2);
  if (!scanner || extra.length) { process.stderr.write('Usage: verify-scanner-regression.ts SCANNER [CONFIG]\n'); process.exitCode = 2; }
  else {
    const result = runScannerRegression({ scanner: resolve(scanner), config: resolve(config) });
    process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.ok ? 0 : 1;
  }
}
