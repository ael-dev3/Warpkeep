import { constants, openSync, closeSync, lstatSync, fstatSync, realpathSync, mkdirSync, fsyncSync } from 'node:fs';
const ROOT = '/home/warpkeep/.warpkeep-recovery-v1';
const fail = () => { throw new Error('RECOVERY_WORKFLOW_PRIVATE_DIRECTORY_INVALID'); };
const valid = state => state.isDirectory() && state.uid === 1000n && (state.mode & 0o7777n) === 0o700n;
const same = (a, b) => ['dev', 'ino', 'mode', 'uid'].every(key => a[key] === b[key]);
function directory(args, create) {
  let parent, child;
  try {
    if (args.length !== 2 || process.platform !== 'linux' || process.getuid() !== 1000
        || args.some(value => typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/u.test(value))) fail();
    if (realpathSync(ROOT) !== ROOT) fail();
    const original = lstatSync(ROOT, { bigint: true });
    if (!valid(original)) fail();
    parent = openSync(ROOT, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    if (!same(original, fstatSync(parent, { bigint: true }))) fail();
    const name = `pages-${args[0]}-${args[1]}`;
    const heldPath = `/proc/self/fd/${parent}/${name}`;
    // Exclusive allocation: an existing attempt is for reconciliation, never reuse.
    if (create) mkdirSync(heldPath, { mode: 0o700 });
    const before = lstatSync(heldPath, { bigint: true });
    if (!valid(before)) fail();
    child = openSync(heldPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    if (!same(before, fstatSync(child, { bigint: true }))) fail();
    if (create) { fsyncSync(child); fsyncSync(parent); }
    if (!same(before, lstatSync(heldPath, { bigint: true })) || !same(original, lstatSync(ROOT, { bigint: true }))
        || realpathSync(`${ROOT}/${name}`) !== `${ROOT}/${name}`) fail();
    return `${ROOT}/${name}`;
  } catch { fail(); }
  finally {
    for (const fd of [child, parent]) if (fd !== undefined) { try { closeSync(fd); } catch { fail(); } }
  }
}
/** Caller supplies independently verified run coordinates, never a path. No authentication claim. */
export function createRecoveryWorkflowPrivateDirectory(...args) { return directory(args, true); }
/** Existing directory only; receipt verification remains mandatory. */
export function resolveRecoveryWorkflowPrivateDirectory(...args) { return directory(args, false); }
