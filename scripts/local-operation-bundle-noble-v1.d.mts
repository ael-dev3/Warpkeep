export type OperationBundleNobleFile = Readonly<{
  path: string; bytes: number; executable: false; sha256: string;
}>;
export const OPERATION_BUNDLE_NOBLE_PACKAGE: Readonly<{
  key: 'node_modules/@noble/hashes'; name: '@noble/hashes'; version: '1.8.0';
  resolved: string; integrity: string; files: readonly OperationBundleNobleFile[];
}>;
export const OPERATION_BUNDLE_NOBLE_GRAPH_FILES: readonly OperationBundleNobleFile[];
