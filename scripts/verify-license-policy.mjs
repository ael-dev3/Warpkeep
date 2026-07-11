import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const LEGACY_0BSD_SHA256 = 'ca4c1f2732106deec154294b650f3f87daa99bed9b570fbe01c9a124e852b701';
const LEGACY_CC0_SHA256 = 'a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499';
const APACHE_2_0_SHA256 = 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30';
const CC_BY_4_0_SHA256 = '9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411';

const requiredPolicyFiles = [
  'LICENSING.md',
  'LICENSE-CC0',
  'docs/legal/license-inventory.md',
  'docs/legal/v0.3.0-license-cutover.md',
  'TRADEMARKS.md',
  'CONTRIBUTING.md'
];

async function text(relativePath) {
  return readFile(resolve(repositoryRoot, relativePath), 'utf8');
}

async function exists(relativePath) {
  try {
    await access(resolve(repositoryRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function sha256(relativePath) {
  const content = await readFile(resolve(repositoryRoot, relativePath));
  return createHash('sha256').update(content).digest('hex');
}

function fail(message) {
  throw new Error(`License policy verification failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function isAtLeastV03(version) {
  const [major, minor] = String(version).split('.').map(Number);
  return major > 0 || (major === 0 && minor >= 3);
}

async function verifyPreparationState(packageJson) {
  assert(await sha256('LICENSE') === LEGACY_0BSD_SHA256, 'root LICENSE must remain the exact historical 0BSD text before v0.3.0');
  assert(packageJson.license === '0BSD', 'root package software license must remain 0BSD before v0.3.0');
  assert(await exists('LICENSE-CC0'), 'historical LICENSE-CC0 must remain available before v0.3.0');

  const licensing = await text('LICENSING.md');
  assert(licensing.includes('v0.3.0'), 'LICENSING.md must state the v0.3.0 transition');
  assert(licensing.includes('Apache-2.0'), 'LICENSING.md must state the future Apache-2.0 policy');
  assert(licensing.includes('CC-BY-4.0'), 'LICENSING.md must state the future CC-BY-4.0 policy');
  assert(licensing.includes('Historical 0BSD and CC0 grants are not revoked.'), 'LICENSING.md must preserve historical grants explicitly');

  const readme = await text('README.md');
  const opening = readme.split(/^## /m, 1)[0];
  assert(!/^#{1,6}\s+Licen[cs]e\b/im.test(readme), 'README must not contain a License heading');
  assert((opening.match(/https:\/\/warpkeep\.com\//g) ?? []).length === 1, 'README opening must contain exactly one canonical warpkeep.com URL');
  assert(opening.includes('[warpkeep.com](https://warpkeep.com/)'), 'README opening must use warpkeep.com as the visible product link');
  assert(!readme.includes('ael-dev3.github.io/Warpkeep'), 'README must not use the legacy path-based Pages URL');
  assert(!/Historical 0BSD and CC0 grants are revoked/i.test(readme), 'README must not claim historical grants were revoked');

  assert(await sha256('LICENSE-CC0') === LEGACY_CC0_SHA256, 'LICENSE-CC0 must remain byte-for-byte unchanged before v0.3.0');
}

async function verifyCutoverState(packageJson) {
  assert(packageJson.license === 'Apache-2.0', 'root package software license must be Apache-2.0 at v0.3.0');
  assert(await sha256('LICENSE') === APACHE_2_0_SHA256, 'root LICENSE must be the exact Apache-2.0 text');
  assert(await exists('LICENSE-CC-BY-4.0'), 'active CC-BY-4.0 legal text must exist');
  assert(await sha256('LICENSE-CC-BY-4.0') === CC_BY_4_0_SHA256, 'active CC-BY-4.0 text must be exact');

  const legacy0bsd = 'licenses/legacy/LICENSE-0BSD-v0.2.0';
  const legacyCc0 = 'licenses/legacy/LICENSE-CC0-1.0-v0.2.0';
  assert(await exists(legacy0bsd) && await sha256(legacy0bsd) === LEGACY_0BSD_SHA256, 'legacy 0BSD text must be preserved exactly');
  assert(await exists(legacyCc0) && await sha256(legacyCc0) === LEGACY_CC0_SHA256, 'legacy CC0 text must be preserved exactly');
  assert(await exists('NOTICE'), 'Apache NOTICE file must exist at cutover');
  assert(await exists('.reuse/dep5'), 'path-based REUSE metadata must exist at cutover');

  for (const manifest of ['package.json', 'services/auth-bridge/package.json', 'spacetimedb/package.json']) {
    const current = JSON.parse(await text(manifest));
    assert(current.license === 'Apache-2.0', `${manifest} must declare Apache-2.0 at cutover`);
  }

  const licensing = await text('LICENSING.md');
  assert(/v0\.3\.0 cutover commit SHA:\s*[0-9a-f]{40}/i.test(licensing), 'LICENSING.md must record the full cutover commit SHA');
}

async function main() {
  const packageJson = JSON.parse(await text('package.json'));
  for (const required of requiredPolicyFiles) {
    assert(await exists(required), `required policy file is missing: ${required}`);
  }

  if (isAtLeastV03(packageJson.version)) {
    await verifyCutoverState(packageJson);
    console.log(`Verified Warpkeep v${packageJson.version} Apache-2.0/CC-BY-4.0 cutover state.`);
  } else {
    await verifyPreparationState(packageJson);
    console.log(`Verified Warpkeep v${packageJson.version} pre-v0.3.0 licensing transition state.`);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Could not verify license policy.');
    process.exitCode = 1;
  });
}
