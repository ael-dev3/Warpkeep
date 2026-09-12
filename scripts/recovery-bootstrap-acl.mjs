/**
 * Accepts only the post-hardening `icacls` shape we create: one explicit,
 * current-user full-control ACE and no other permission ACE. The command
 * resolves a short local user name to `MACHINE\\user` or `DOMAIN\\user`, so
 * both exact and qualified current-user forms are accepted.
 */
export function isExactCurrentOwnerOnlyAcl(output, username) {
  if (typeof output !== 'string' || typeof username !== 'string' || username.length === 0) {
    return false;
  }
  const expected = username.toLowerCase();
  const entries = output.split(/\r?\n/u)
    .map((line) => line.match(/([^\s:]+):\((.+)\)\s*$/u))
    .filter((match) => match !== null)
    .map((match) => ({
      account: match[1],
      rights: match[2].split(')(').map((part) => part.replace(/[()]/gu, ''))
    }));
  if (
    entries.length !== 1
    || ![['F'], ['OI', 'CI', 'F']].some((expectedRights) =>
      expectedRights.length === entries[0].rights.length
      && expectedRights.every((right, index) => right === entries[0].rights[index])
    )
  ) return false;
  const account = entries[0].account.toLowerCase();
  return account === expected || account.endsWith(`\\${expected}`) || account.endsWith(`/${expected}`);
}
