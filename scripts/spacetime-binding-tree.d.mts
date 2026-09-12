export interface SpacetimeBindingTreeEntry {
  path: string;
  bytes: Buffer;
}

export function readSpacetimeBindingTree(root: string): Promise<SpacetimeBindingTreeEntry[]>;

export function compareSpacetimeBindingTrees(
  expectedRoot: string,
  actualRoot: string
): Promise<string[]>;
