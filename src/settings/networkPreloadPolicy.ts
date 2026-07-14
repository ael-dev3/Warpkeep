export type NetworkConnectionSnapshot = Readonly<{
  effectiveType?: string;
  saveData?: boolean;
}>;

export type NetworkNavigatorSnapshot = Readonly<{
  connection?: NetworkConnectionSnapshot;
}>;

/**
 * Speculative menu media is optional. Respect explicit data-saving and defer
 * multi-megabyte audio/video work on every connection the browser identifies
 * as slower than 4G; entering the menu still starts its required media path.
 */
export function allowsSpeculativeMenuMediaPreload(
  navigatorSnapshot?: NetworkNavigatorSnapshot
) {
  const connection = navigatorSnapshot?.connection;
  if (!connection) return true;
  if (connection.saveData === true) return false;

  const effectiveType = connection.effectiveType?.trim().toLowerCase();
  return !effectiveType || effectiveType === '4g';
}
