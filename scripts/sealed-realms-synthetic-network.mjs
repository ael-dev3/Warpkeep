import { lstatSync, statSync, statfsSync } from 'node:fs';

// The privileged fixture launcher retains its pre-unshare network namespace here inside its
// private mount namespace. /run is root-owned; ordinary callers cannot supply
// a regular file or a symlink as evidence of a different network namespace.
const anchorPath = '/run/warpkeep-synthetic-host-netns';
export function readSyntheticNetworkIdentity() {
  const fail = () => { throw new Error('SEALED_REALMS_SYNTHETIC_NETWORK_INVALID'); };
  if (process.platform !== 'linux' || process.getuid() <= 0) fail();
  const parent = lstatSync('/run');
  const anchor = lstatSync(anchorPath);
  const current = statSync('/proc/self/ns/net');
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== 0
    || (parent.mode & 0o022) !== 0 || anchor.isSymbolicLink() || anchor.uid !== 0
    || statfsSync(anchorPath).type !== 0x6e736673
    || (anchor.dev === current.dev && anchor.ino === current.ino)) fail();
  return Object.freeze({ hostDevice: anchor.dev, hostInode: anchor.ino,
    namespaceDevice: current.dev, namespaceInode: current.ino });
}
