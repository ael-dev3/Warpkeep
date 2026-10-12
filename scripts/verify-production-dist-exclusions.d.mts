export const allowedProductionHiddenPaths: readonly ['.well-known/farcaster.json'];
export const allowedProductionHtmlPaths: readonly [
  'index.html',
  'owner-canary/index.html',
  'privacy/index.html',
  'social-contract/index.html',
  'terms/index.html',
];
export const expectedProductionCspByPath: Readonly<{
  'index.html': string;
  'owner-canary/index.html': string;
  'privacy/index.html': string;
  'social-contract/index.html': string;
  'terms/index.html': string;
}>;

/** Verifies the actual output tree; the omitted path uses this script's dist root. */
export function verifyProductionDistExclusions(outputDirectory?: string): void;
