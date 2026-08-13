export const GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION =
  'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = false;';
export const GREATER_REALM_IMPORT_GATE_TRUE_DECLARATION =
  'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = true;';
export const GREATER_REALM_ACTIVATION_GATE_FALSE_DECLARATION =
  'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = false;';
export const GREATER_REALM_ACTIVATION_GATE_TRUE_DECLARATION =
  'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = true;';

export const GREATER_REALM_CONNECTED_PRODUCTION_GATE_MODES = Object.freeze([
  'FF',
  'TF',
  'FT',
] as const);

export type GreaterRealmConnectedProductionGateMode =
  typeof GREATER_REALM_CONNECTED_PRODUCTION_GATE_MODES[number];
export type GreaterRealmConnectedGateMode =
  GreaterRealmConnectedProductionGateMode | 'TT';
export type GreaterRealmConnectedDisposableGateMode = 'TF' | 'TT';

export type GreaterRealmConnectedGateState = Readonly<{
  mode: GreaterRealmConnectedGateMode;
  importMutationsAllowed: boolean;
  activationMutationsAllowed: boolean;
}>;

const importGateName = 'GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED';
const activationGateName = 'GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED';
const gateMarkerPrefix = 'warpkeep.connected-gate-mode.marker.';

class GreaterRealmConnectedGateModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GreaterRealmConnectedGateModeError';
  }
}

function fail(message: string): never {
  throw new GreaterRealmConnectedGateModeError(message);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function countExactDeclarationLines(source: string, declaration: string): number {
  return source.match(new RegExp(`^${escapeRegExp(declaration)}$`, 'gmu'))?.length ?? 0;
}

function countGateName(source: string, gateName: string): number {
  return source.match(new RegExp(`\\b${gateName}\\b`, 'gu'))?.length ?? 0;
}

function declarationIsTopLevel(codeSource: string, declaration: string): boolean {
  const declarationIndex = codeSource.indexOf(declaration);
  if (declarationIndex < 0) return false;
  let braceDepth = 0;
  for (let index = 0; index < declarationIndex; index += 1) {
    if (codeSource[index] === '{') braceDepth += 1;
    else if (codeSource[index] === '}') {
      braceDepth -= 1;
      if (braceDepth < 0) return false;
    }
  }
  return braceDepth === 0;
}

function maskCommentsAndStrings(source: string): string {
  type State = 'code' | 'line-comment' | 'block-comment' | 'single' | 'double' | 'template';
  let state: State = 'code';
  let masked = '';
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index]!;
    const next = source[index + 1];
    if (current === '\n' || current === '\r') {
      masked += current;
      if (state === 'line-comment') state = 'code';
      continue;
    }
    if (state === 'code') {
      if (current === '/' && next === '/') {
        masked += '  ';
        index += 1;
        state = 'line-comment';
      } else if (current === '/' && next === '*') {
        masked += '  ';
        index += 1;
        state = 'block-comment';
      } else if (current === "'") {
        masked += ' ';
        state = 'single';
      } else if (current === '"') {
        masked += ' ';
        state = 'double';
      } else if (current === '`') {
        masked += ' ';
        state = 'template';
      } else {
        masked += current;
      }
      continue;
    }
    masked += ' ';
    if (state === 'block-comment' && current === '*' && next === '/') {
      masked += ' ';
      index += 1;
      state = 'code';
    } else if (
      (state === 'single' || state === 'double' || state === 'template')
      && current === '\\'
      && next !== undefined
    ) {
      if (next === '\n' || next === '\r') masked += next;
      else masked += ' ';
      index += 1;
    } else if (
      (state === 'single' && current === "'")
      || (state === 'double' && current === '"')
      || (state === 'template' && current === '`')
    ) {
      state = 'code';
    }
  }
  if (state === 'block-comment' || state === 'single' || state === 'double' || state === 'template') {
    fail('Greater Realm gate policy source contained an unterminated lexical construct.');
  }
  return masked;
}

function parseExactGate(
  source: string,
  codeSource: string,
  gateName: string,
  falseDeclaration: string,
  trueDeclaration: string,
): boolean {
  const falseCount = countExactDeclarationLines(source, falseDeclaration);
  const trueCount = countExactDeclarationLines(source, trueDeclaration);
  if (
    countGateName(source, gateName) !== 1
    || falseCount + trueCount !== 1
    || countExactDeclarationLines(
      codeSource,
      trueCount === 1 ? trueDeclaration : falseDeclaration,
    ) !== 1
    || !declarationIsTopLevel(
      codeSource,
      trueCount === 1 ? trueDeclaration : falseDeclaration,
    )
  ) {
    fail(`Greater Realm ${gateName} declaration was missing, duplicated, or malformed.`);
  }
  return trueCount === 1;
}

function parseExactGreaterRealmConnectedGateMode(
  source: string,
): GreaterRealmConnectedGateState {
  if (typeof source !== 'string' || source.includes(gateMarkerPrefix)) {
    fail('Greater Realm gate policy source was invalid.');
  }
  const codeSource = maskCommentsAndStrings(source);
  const importMutationsAllowed = parseExactGate(
    source,
    codeSource,
    importGateName,
    GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION,
    GREATER_REALM_IMPORT_GATE_TRUE_DECLARATION,
  );
  const activationMutationsAllowed = parseExactGate(
    source,
    codeSource,
    activationGateName,
    GREATER_REALM_ACTIVATION_GATE_FALSE_DECLARATION,
    GREATER_REALM_ACTIVATION_GATE_TRUE_DECLARATION,
  );
  const mode = `${importMutationsAllowed ? 'T' : 'F'}${
    activationMutationsAllowed ? 'T' : 'F'
  }` as GreaterRealmConnectedGateMode;
  return Object.freeze({ mode, importMutationsAllowed, activationMutationsAllowed });
}

/**
 * Parse the exact checked-in gate declarations. Fully open production source
 * is never a reviewed protected-main envelope and therefore fails closed.
 */
export function parseGreaterRealmConnectedProductionGateMode(
  source: string,
): GreaterRealmConnectedGateState & Readonly<{
  mode: GreaterRealmConnectedProductionGateMode;
}> {
  const parsed = parseExactGreaterRealmConnectedGateMode(source);
  if (parsed.mode === 'TT') {
    fail('Greater Realm production mutation gates were both open.');
  }
  return parsed as GreaterRealmConnectedGateState & Readonly<{
    mode: GreaterRealmConnectedProductionGateMode;
  }>;
}

function declarationFor(importGate: boolean, allowed: boolean): string {
  if (importGate) {
    return allowed
      ? GREATER_REALM_IMPORT_GATE_TRUE_DECLARATION
      : GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION;
  }
  return allowed
    ? GREATER_REALM_ACTIVATION_GATE_TRUE_DECLARATION
    : GREATER_REALM_ACTIVATION_GATE_FALSE_DECLARATION;
}

function stateForMode(mode: GreaterRealmConnectedGateMode): Readonly<{
  importMutationsAllowed: boolean;
  activationMutationsAllowed: boolean;
}> {
  return Object.freeze({
    importMutationsAllowed: mode[0] === 'T',
    activationMutationsAllowed: mode[1] === 'T',
  });
}

function gateNeutralSource(source: string, state: Readonly<{
  importMutationsAllowed: boolean;
  activationMutationsAllowed: boolean;
}>): string {
  return source
    .replace(
      declarationFor(true, state.importMutationsAllowed),
      `${gateMarkerPrefix}import`,
    )
    .replace(
      declarationFor(false, state.activationMutationsAllowed),
      `${gateMarkerPrefix}activation`,
    );
}

/**
 * Normalize only an already-copied policy to the exact connected scenario.
 * The gate-neutral byte check proves that no content beyond the two reviewed
 * declarations changed.
 */
export function normalizeGreaterRealmConnectedDisposableGateMode(
  source: string,
  targetMode: GreaterRealmConnectedDisposableGateMode,
): string {
  if (targetMode !== 'TF' && targetMode !== 'TT') {
    fail('Disposable Greater Realm target gate mode was invalid.');
  }
  const initial = parseGreaterRealmConnectedProductionGateMode(source);
  const target = stateForMode(targetMode);
  const normalized = source
    .replace(
      declarationFor(true, initial.importMutationsAllowed),
      declarationFor(true, target.importMutationsAllowed),
    )
    .replace(
      declarationFor(false, initial.activationMutationsAllowed),
      declarationFor(false, target.activationMutationsAllowed),
    );
  const parsed = parseExactGreaterRealmConnectedGateMode(normalized);
  if (
    parsed.mode !== targetMode
    || gateNeutralSource(source, initial) !== gateNeutralSource(normalized, target)
  ) fail('Disposable Greater Realm gate normalization changed unexpected source bytes.');
  return normalized;
}

/** Verify a private copied policy after its exact scenario normalization. */
export function assertGreaterRealmConnectedDisposableGateMode(
  source: string,
  expectedMode: GreaterRealmConnectedDisposableGateMode,
): void {
  if (expectedMode !== 'TF' && expectedMode !== 'TT') {
    fail('Disposable Greater Realm expected gate mode was invalid.');
  }
  const parsed = parseExactGreaterRealmConnectedGateMode(source);
  if (parsed.mode !== expectedMode) {
    fail(`Disposable Greater Realm gate mode was ${parsed.mode}, expected ${expectedMode}.`);
  }
}
