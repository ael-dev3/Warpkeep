import { lstatSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Own only the exact roots created by this test file, never a prefix inventory. */
export function createOwnedTemporaryFixtures() {
  const parent = realpathSync(tmpdir());
  const roots = new Map<string, Readonly<{ device: bigint; inode: bigint }>>();
  return {
    create(prefix: string): string {
      if (!/^warpkeep-[a-z0-9-]+-$/.test(prefix)) throw new Error('Invalid fixture prefix.');
      const root = mkdtempSync(join(parent, prefix));
      const identity = lstatSync(root, { bigint: true });
      roots.set(root, { device: identity.dev, inode: identity.ino });
      return root;
    },
    cleanup(): void {
      const errors: unknown[] = [];
      for (const [root, original] of roots) {
        try {
          let current;
          try { current = lstatSync(root, { bigint: true }); }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            roots.delete(root);
            continue;
          }
          if (dirname(root) !== parent || !current.isDirectory() || current.isSymbolicLink()
            || current.dev !== original.device || current.ino !== original.inode) {
            throw new Error('Owned fixture root changed before cleanup.');
          }
          // Node removes child symlinks themselves; it does not traverse their targets.
          rmSync(root, { recursive: true, force: true });
          roots.delete(root);
        } catch (error) { errors.push(error); }
      }
      if (errors.length > 0) throw new AggregateError(errors, 'Fixture cleanup failed.');
    },
  };
}
