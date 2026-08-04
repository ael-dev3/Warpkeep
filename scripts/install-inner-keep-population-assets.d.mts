export function parseInnerKeepPopulationPreparationMode(
  argumentsList: readonly string[]
): '--audit-only' | '--install';
export function prepareInnerKeepPopulationAssets(options?: Readonly<{
  argumentsList?: readonly string[];
  cacheRoot?: string;
}>): Readonly<{
  mode: '--audit-only' | '--install';
  files: number;
  installed: boolean;
}>;
export function main(argumentsList?: readonly string[]): void;
