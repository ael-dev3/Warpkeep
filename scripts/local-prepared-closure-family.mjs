import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { derivePreparedClosurePolicyInventoryAndCounts } from './local-prepared-closure-inventory.mjs';
import { derivePreparedSourcePins } from './local-prepared-source-pins.mjs';
import { isPreparedReleaseOutputPath } from './local-release-recovery-journal.mjs';

const VERIFIER = 'scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
const MANIFEST = 'scripts/auth-bridge-notification-prepared-deploy-closure-v1.json';
const SOURCE_PIN_OUTPUTS = ['scripts/generate-0.4.0-sealed-launch-activation.mjs',
  'scripts/verify-0.4.0-sealed-launch.mjs', 'tests/sealedLaunchActivationGenerator.test.ts'];
const WORKFLOWS = ['.github/workflows/deploy-pages.yml', '.github/workflows/notification-bridge-b0.yml',
  '.github/workflows/notification-bridge-prepared-linux.yml',
  '.github/workflows/notification-bridge-prepared.yml'];
const INVENTORY = /^export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS =\r?\n  Object\.freeze\(\[\r?\n(?:    '[A-Za-z0-9._/-]+',\r?\n)+  \]\);/gm;
const MAX_FILE = 4 * 1024 * 1024;
const MAX_TOTAL = 128 * 1024 * 1024;
function fail() { throw new Error('LOCAL_PREPARED_CLOSURE_FAMILY_INVALID'); }
function text(bytes) {
  const result = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!Buffer.from(result).equals(Buffer.from(bytes))) fail();
  return result;
}
function projection(source) {
  if ([...source.matchAll(INVENTORY)].length !== 1) fail();
  return source.replace(INVENTORY, '<fixed-generated-inventory>');
}

/** Derive only. Native source capture, installation, and independent checking
 * remain the assembler's responsibilities. No caller byte map or loader exists.
 */
export async function derivePreparedClosureFamily(...args) {
  let trustedBody;
  const owned = [];
  let success = false;
  try {
    if (args.length !== 1) fail();
    const options = args[0];
    if (options === null || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype
      || Reflect.ownKeys(options).length !== 1 || !Object.hasOwn(options, 'repositoryRoot')
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(options, 'repositoryRoot'), 'value')
      || typeof options.repositoryRoot !== 'string') fail();
    const derived = derivePreparedClosurePolicyInventoryAndCounts(options);
    const outputs = new Map();
    for (const file of derived.files) {
      owned.push(file.bytes);
      if (!isPreparedReleaseOutputPath(file.path) || outputs.has(file.path)) fail();
      outputs.set(file.path, file.bytes);
    }
    if (outputs.size !== 8 || !outputs.has(VERIFIER)) fail();
    // Execute only the tool's established verifier implementation with its
    // generated literal inventory. Reject any other candidate code change before
    // import, including injected top-level code or changed verification rules.
    trustedBody = readLocalBindingBoundedFile(resolve(dirname(fileURLToPath(import.meta.url)), '..', VERIFIER),
      { maximumBytes: MAX_FILE, minimumBytes: 1 }).body;
    const generatedSource = text(outputs.get(VERIFIER));
    if (projection(generatedSource) !== projection(text(trustedBody))) fail();
    const verifier = await import(`data:text/javascript;base64,${Buffer.from(generatedSource).toString('base64')}`);
    const paths = verifier.AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS;
    if (!Array.isArray(paths) || paths.length !== derived.memberCount || paths.length > 2048) fail();
    // These generated pins depend on the prospective operating sources, but
    // neither reads the policy/count outputs above. Derive them before the
    // manifest so its raw-file hashes bind the new generator and verifier.
    const pins = derivePreparedSourcePins(options);
    owned.push(...pins.files.map(file => file.bytes));
    if (JSON.stringify(pins.files.map(file => file.path)) !== JSON.stringify(SOURCE_PIN_OUTPUTS)) fail();
    for (const file of pins.files) {
      // Generated regression-fixture pins are part of the installation family,
      // but tests are deliberately outside the executable protected closure.
      if ((!file.path.startsWith('tests/') && !paths.includes(file.path)) || outputs.has(file.path)) fail();
      outputs.set(file.path, file.bytes);
    }
    const bodies = new Map();
    let total = 0;
    for (const path of paths) {
      if (bodies.has(path)) fail();
      let bytes = outputs.get(path);
      if (bytes === undefined) {
        bytes = readLocalBindingBoundedFile(resolve(options.repositoryRoot, path),
          { maximumBytes: MAX_FILE, minimumBytes: 1 }).body;
        owned.push(bytes);
      }
      total += bytes.length;
      if (total > MAX_TOTAL) fail();
      bodies.set(path, bytes);
    }
    const closure = verifier.deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: bodies });
    owned.push(closure.manifestBytes, ...closure.workflowBodies.map(file => file.bytes));
    if (closure.memberCount !== derived.memberCount
      || JSON.stringify(closure.workflowBodies.map(file => file.path)) !== JSON.stringify(WORKFLOWS)) fail();
    outputs.set(MANIFEST, closure.manifestBytes);
    for (const file of closure.workflowBodies) {
      if (outputs.has(file.path)) fail();
      outputs.set(file.path, file.bytes);
    }
    const files = [...outputs].sort(([left], [right]) => left < right ? -1 : 1)
      .map(([path, bytes]) => Object.freeze({ path, bytes }));
    if (files.length !== 16 || files.some(file => !isPreparedReleaseOutputPath(file.path))) fail();
    const retained = new Set(files.map(file => file.bytes));
    for (const bytes of owned) if (!retained.has(bytes)) bytes.fill(0);
    success = true;
    return Object.freeze({ memberCount: derived.memberCount, manifestSha256: closure.manifestSha256,
      files: Object.freeze(files) });
  } catch { fail(); }
  finally {
    trustedBody?.fill(0);
    if (!success) for (const bytes of owned) bytes.fill(0);
  }
}
