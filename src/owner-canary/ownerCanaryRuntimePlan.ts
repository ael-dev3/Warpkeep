export const OWNER_CANARY_COMMAND_KEY_DOMAIN =
  'warpkeep.production-player-canary.command-key.v1';
export const OWNER_CANARY_COMMAND_SET_DOMAIN =
  'warpkeep.production-player-canary.command-set.v1';

export const OWNER_CANARY_COMMAND_OPERATIONS = Object.freeze([
  'dispatch',
  'recall',
] as const);

export type OwnerCanaryCommandOperation = typeof OWNER_CANARY_COMMAND_OPERATIONS[number];
export type OwnerCanaryCommandOrdinal = 1 | 2 | 3 | 4;

declare const ownerCanaryRuntimePlanBrand: unique symbol;

/**
 * Empty, module-branded handle. Its command material exists only in this
 * module's private WeakMap and has no property/getter surface.
 */
export type OwnerCanaryRuntimePlan = Readonly<{
  readonly [ownerCanaryRuntimePlanBrand]: true;
}>;

export type OwnerCanaryRuntimePlanPreparation = Readonly<{
  evidenceNonce: string;
  reviewedAdmissionPlanDigest: string;
  serverBaselineCommitment: string;
  routeSetCommitment: string;
  expectedCommandSetCommitment: string;
}>;

export type OwnerCanaryRuntimeCommandConsumer<Authority> = (
  input: Readonly<{
    operation: OwnerCanaryCommandOperation;
    ordinal: OwnerCanaryCommandOrdinal;
    idempotencyKey: string;
    authority: Authority;
    signal: AbortSignal;
  }>,
) => Promise<void>;

export type OwnerCanaryRuntimePlanBoundary<Authority> = Readonly<{
  prepare(input: OwnerCanaryRuntimePlanPreparation): Promise<OwnerCanaryRuntimePlan>;
  runCommand(input: Readonly<{
    plan: OwnerCanaryRuntimePlan;
    operation: OwnerCanaryCommandOperation;
    ordinal: OwnerCanaryCommandOrdinal;
    authority: Authority;
    signal: AbortSignal;
  }>): Promise<void>;
  dispose(plan: OwnerCanaryRuntimePlan): void;
}>;

export type OwnerCanaryRuntimePlanFailureCode =
  | 'invalid-plan-input'
  | 'command-set-mismatch'
  | 'invalid-plan-handle'
  | 'invalid-command'
  | 'plan-poisoned'
  | 'command-failed';

const SHA256 = /^[0-9a-f]{64}$/u;
const PLAN_INPUT_KEYS = Object.freeze([
  'evidenceNonce',
  'reviewedAdmissionPlanDigest',
  'serverBaselineCommitment',
  'routeSetCommitment',
  'expectedCommandSetCommitment',
]);
const COMMAND_INPUT_KEYS = Object.freeze([
  'plan',
  'operation',
  'ordinal',
  'authority',
  'signal',
]);
const ORDINALS = Object.freeze([1, 2, 3, 4] as const);
const failureCodes = new WeakMap<Error, OwnerCanaryRuntimePlanFailureCode>();

type CommandMaterial = Readonly<{
  dispatch: readonly [string, string, string, string];
  recall: readonly [string, string, string, string];
  commandSetCommitment: string;
}>;

type PlanRecord = {
  readonly commands: CommandMaterial;
  activeCommand: boolean;
  poisoned: boolean;
};

export class OwnerCanaryRuntimePlanError extends Error {
  override readonly name = 'OwnerCanaryRuntimePlanError';

  constructor() {
    super('The owner canary runtime plan stopped.');
  }
}

function failure(code: OwnerCanaryRuntimePlanFailureCode): OwnerCanaryRuntimePlanError {
  const error = new OwnerCanaryRuntimePlanError();
  failureCodes.set(error, code);
  return error;
}

export function ownerCanaryRuntimePlanFailureCode(
  error: unknown,
): OwnerCanaryRuntimePlanFailureCode | null {
  return error instanceof OwnerCanaryRuntimePlanError
    ? failureCodes.get(error) ?? 'command-failed'
    : null;
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) return false;
  const actual = (ownKeys as string[]).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && expected.every((key, index) => actual[index] === key);
}

function framedTextBytes(frames: readonly string[]): Uint8Array {
  const encoder = new TextEncoder();
  const encoded = frames.map((frame) => encoder.encode(frame));
  const lengths = encoded.map((frame) => encoder.encode(`${frame.byteLength}:`));
  const totalLength = encoded.reduce((total, frame, index) => (
    total + lengths[index]!.byteLength + frame.byteLength + 1
  ), 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let index = 0; index < encoded.length; index += 1) {
    const length = lengths[index]!;
    const frame = encoded[index]!;
    result.set(length, offset);
    offset += length.byteLength;
    result.set(frame, offset);
    offset += frame.byteLength;
    result[offset] = index === encoded.length - 1 ? 0x0a : 0x7c;
    offset += 1;
    length.fill(0);
    frame.fill(0);
  }
  return result;
}

async function sha256Frames(frames: readonly string[]): Promise<string> {
  const material = framedTextBytes(frames);
  try {
    const digest = new Uint8Array(await crypto.subtle.digest(
      'SHA-256',
      material.buffer as ArrayBuffer,
    ));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } finally {
    material.fill(0);
  }
}

function commandPrefix(
  operation: OwnerCanaryCommandOperation,
  ordinal: OwnerCanaryCommandOrdinal,
): string {
  return `pc1-${operation === 'dispatch' ? 'd' : 'r'}${ordinal.toString().padStart(2, '0')}-`;
}

async function commandKey(
  input: Omit<OwnerCanaryRuntimePlanPreparation, 'expectedCommandSetCommitment'>,
  operation: OwnerCanaryCommandOperation,
  ordinal: OwnerCanaryCommandOrdinal,
): Promise<string> {
  const digest = await sha256Frames([
    OWNER_CANARY_COMMAND_KEY_DOMAIN,
    input.evidenceNonce,
    input.reviewedAdmissionPlanDigest,
    input.serverBaselineCommitment,
    input.routeSetCommitment,
    operation,
    ordinal.toString(),
  ]);
  return `${commandPrefix(operation, ordinal)}${digest}`;
}

async function deriveCommandMaterial(
  input: Omit<OwnerCanaryRuntimePlanPreparation, 'expectedCommandSetCommitment'>,
): Promise<CommandMaterial> {
  const dispatch = [] as string[];
  const recall = [] as string[];
  for (const ordinal of ORDINALS) {
    dispatch.push(await commandKey(input, 'dispatch', ordinal));
    recall.push(await commandKey(input, 'recall', ordinal));
  }
  const exactDispatch = dispatch as [string, string, string, string];
  const exactRecall = recall as [string, string, string, string];
  const orderedKeys = ORDINALS.flatMap((_ordinal, index) => [
    exactDispatch[index]!,
    exactRecall[index]!,
  ]);
  const commandSetCommitment = await sha256Frames([
    OWNER_CANARY_COMMAND_SET_DOMAIN,
    input.evidenceNonce,
    input.reviewedAdmissionPlanDigest,
    input.serverBaselineCommitment,
    input.routeSetCommitment,
    ...orderedKeys,
  ]);
  return Object.freeze({
    dispatch: Object.freeze(exactDispatch),
    recall: Object.freeze(exactRecall),
    commandSetCommitment,
  });
}

function exactPlanPreparation(value: unknown): OwnerCanaryRuntimePlanPreparation | undefined {
  if (!hasExactKeys(value, PLAN_INPUT_KEYS)) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const evidenceNonce = descriptors.evidenceNonce?.value;
  const reviewedAdmissionPlanDigest = descriptors.reviewedAdmissionPlanDigest?.value;
  const serverBaselineCommitment = descriptors.serverBaselineCommitment?.value;
  const routeSetCommitment = descriptors.routeSetCommitment?.value;
  const expectedCommandSetCommitment = descriptors.expectedCommandSetCommitment?.value;
  if (
    typeof evidenceNonce !== 'string' || !SHA256.test(evidenceNonce)
    || typeof reviewedAdmissionPlanDigest !== 'string' || !SHA256.test(reviewedAdmissionPlanDigest)
    || typeof serverBaselineCommitment !== 'string' || !SHA256.test(serverBaselineCommitment)
    || typeof routeSetCommitment !== 'string' || !SHA256.test(routeSetCommitment)
    || typeof expectedCommandSetCommitment !== 'string'
      || !SHA256.test(expectedCommandSetCommitment)
  ) return undefined;
  return Object.freeze({
    evidenceNonce,
    reviewedAdmissionPlanDigest,
    serverBaselineCommitment,
    routeSetCommitment,
    expectedCommandSetCommitment,
  });
}

function exactCommandInput<Authority>(value: unknown): Readonly<{
  plan: OwnerCanaryRuntimePlan;
  operation: OwnerCanaryCommandOperation;
  ordinal: OwnerCanaryCommandOrdinal;
  authority: Authority;
  signal: AbortSignal;
}> | undefined {
  if (!hasExactKeys(value, COMMAND_INPUT_KEYS)) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const plan = descriptors.plan?.value as OwnerCanaryRuntimePlan;
  const operation = descriptors.operation?.value as OwnerCanaryCommandOperation;
  const ordinal = descriptors.ordinal?.value as OwnerCanaryCommandOrdinal;
  const authority = descriptors.authority?.value as Authority;
  const signal = descriptors.signal?.value;
  if (
    !OWNER_CANARY_COMMAND_OPERATIONS.includes(operation)
    || !ORDINALS.includes(ordinal)
    || !(signal instanceof AbortSignal)
  ) return undefined;
  return Object.freeze({ plan, operation, ordinal, authority, signal });
}

/**
 * Internal production-runtime integration seam. The future reviewed live
 * adapter owns this boundary and its consumer inside its `evidenceApi.run`
 * closure. UI/React modules must never import or retain it.
 */
export function createOwnerCanaryRuntimePlanBoundary<Authority>(
  consumeCommand: OwnerCanaryRuntimeCommandConsumer<Authority>,
): OwnerCanaryRuntimePlanBoundary<Authority> {
  if (typeof consumeCommand !== 'function') throw failure('invalid-plan-input');
  const plans = new WeakMap<object, PlanRecord>();

  return Object.freeze({
    async prepare(input: OwnerCanaryRuntimePlanPreparation): Promise<OwnerCanaryRuntimePlan> {
      const preparation = exactPlanPreparation(input);
      if (!preparation) throw failure('invalid-plan-input');
      const commands = await deriveCommandMaterial(preparation);
      if (commands.commandSetCommitment !== preparation.expectedCommandSetCommitment) {
        throw failure('command-set-mismatch');
      }
      const plan = Object.freeze({}) as OwnerCanaryRuntimePlan;
      plans.set(plan, { commands, activeCommand: false, poisoned: false });
      return plan;
    },

    async runCommand(input): Promise<void> {
      const command = exactCommandInput<Authority>(input);
      if (!command) throw failure('invalid-command');
      const record = plans.get(command.plan);
      if (!record) throw failure('invalid-plan-handle');
      if (record.poisoned || record.activeCommand) {
        record.poisoned = true;
        throw failure('plan-poisoned');
      }
      if (command.signal.aborted) {
        record.poisoned = true;
        throw failure('command-failed');
      }
      record.activeCommand = true;
      const keys = command.operation === 'dispatch'
        ? record.commands.dispatch
        : record.commands.recall;
      try {
        await consumeCommand(Object.freeze({
          operation: command.operation,
          ordinal: command.ordinal,
          idempotencyKey: keys[command.ordinal - 1],
          authority: command.authority,
          signal: command.signal,
        }));
        if (command.signal.aborted) throw failure('command-failed');
      } catch (error) {
        record.poisoned = true;
        throw error instanceof OwnerCanaryRuntimePlanError
          ? error
          : failure('command-failed');
      } finally {
        record.activeCommand = false;
      }
    },

    dispose(plan: OwnerCanaryRuntimePlan): void {
      const record = plans.get(plan);
      if (record) {
        record.poisoned = true;
        plans.delete(plan);
      }
    },
  });
}

export const ownerCanaryRuntimePlanTestSeams = import.meta.env.MODE === 'test'
  ? Object.freeze({ deriveCommandMaterial })
  : undefined;
