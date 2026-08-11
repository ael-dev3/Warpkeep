import { readFileSync } from 'node:fs';

const IMPORT_GATE = 'GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED';
const ACTIVATION_GATE = 'GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED';

export type GreaterRealmGateMode = 'FF' | 'TF' | 'FT';

export type GreaterRealmGateModeAttestation = Readonly<{
  importMutationsAllowed: boolean;
  activationMutationsAllowed: boolean;
  mode: GreaterRealmGateMode;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function parseLiteralDeclaration(source: string, name: string): boolean {
  const declaration = new RegExp(`^export const ${name} = (true|false);$`, 'gmu');
  const exact = [...source.matchAll(declaration)];
  const candidates = [...source.matchAll(new RegExp(`^export const ${name}\\b.*$`, 'gmu'))];
  if (exact.length !== 1 || candidates.length !== 1) {
    return fail('GREATER_REALM_TEST_GATE_DECLARATION_INVALID');
  }
  return exact[0]![1] === 'true';
}

export function parseGreaterRealmGateModeForTest(
  source: string,
): GreaterRealmGateModeAttestation {
  const importMutationsAllowed = parseLiteralDeclaration(source, IMPORT_GATE);
  const activationMutationsAllowed = parseLiteralDeclaration(source, ACTIVATION_GATE);
  if (importMutationsAllowed && activationMutationsAllowed) {
    return fail('GREATER_REALM_TEST_GATE_MODE_INVALID');
  }
  const mode = `${importMutationsAllowed ? 'T' : 'F'}${
    activationMutationsAllowed ? 'T' : 'F'
  }` as GreaterRealmGateMode;
  return Object.freeze({ importMutationsAllowed, activationMutationsAllowed, mode });
}

export function attestCurrentGreaterRealmGateModeForTest(
  importedImportGate: boolean,
  importedActivationGate: boolean,
): GreaterRealmGateModeAttestation {
  const source = readFileSync(
    new URL('../src/greaterRealmV17Policy.ts', import.meta.url),
    'utf8',
  );
  const attestation = parseGreaterRealmGateModeForTest(source);
  if (
    attestation.importMutationsAllowed !== importedImportGate
    || attestation.activationMutationsAllowed !== importedActivationGate
  ) {
    return fail('GREATER_REALM_TEST_GATE_IMPORT_DRIFT');
  }
  return attestation;
}
