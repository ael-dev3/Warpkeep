import type { Gameplay04KeepErrorCode } from '../../../spacetimedb/gameplay04/keep';
import type { Gameplay04WorkerErrorCode } from '../../../spacetimedb/gameplay04/workers';
import type { Gameplay04ConstructionErrorCode } from '../../../spacetimedb/gameplay04/construction';

type Gameplay04ErrorCode = Gameplay04KeepErrorCode | Gameplay04WorkerErrorCode | Gameplay04ConstructionErrorCode;
type Gameplay04ErrorKind = 'authority' | 'not-initialized' | 'rejected' | 'uncertain' | 'invalid-state';

// Exhaustive against the shared unions; neither Error.message nor object fields
// are transport codes. The SDK rejects procedure result.value directly.
const errorKinds = Object.freeze({
  GAMEPLAY04_NOT_INITIALIZED: 'not-initialized',
  GAMEPLAY04_INPUT_INVALID: 'rejected',
  GAMEPLAY04_RECEIPT_CONFLICT: 'rejected',
  GAMEPLAY04_RECEIPT_EXPIRED: 'rejected',
  GAMEPLAY04_ALREADY_INITIALIZED: 'rejected',
  GAMEPLAY04_SEQUENCE_INVALID: 'rejected',
  GAMEPLAY04_TARGET_INVALID: 'rejected',
  GAMEPLAY04_WORKER_BUSY: 'rejected',
  GAMEPLAY04_LOCATION_FULL: 'rejected',
  GAMEPLAY04_BUILDER_BUSY: 'rejected',
  GAMEPLAY04_INSUFFICIENT_RESOURCES: 'rejected',
  GAMEPLAY04_BINDING_INVALID: 'uncertain',
  GAMEPLAY04_TIMESTAMP_INVALID: 'uncertain',
  GAMEPLAY04_STORED_STATE_INVALID: 'uncertain',
  GAMEPLAY04_BINDING_MISMATCH: 'uncertain',
  GAMEPLAY04_REVISION_OVERFLOW: 'uncertain',
  GAMEPLAY04_ASSIGNMENT_REVISION_OVERFLOW: 'uncertain',
} satisfies Record<Gameplay04ErrorCode, Gameplay04ErrorKind>);

function isGameplay04ErrorCode(value: unknown): value is Gameplay04ErrorCode {
  return typeof value === 'string' && value.length <= 64
    && Object.prototype.hasOwnProperty.call(errorKinds, value);
}

export class Gameplay04ClientError extends Error {
  override readonly name = 'Gameplay04ClientError';
  readonly kind: Gameplay04ErrorKind;
  readonly code: Gameplay04ErrorCode | undefined;

  constructor(kind: Gameplay04ErrorKind, code?: Gameplay04ErrorCode) {
    super('PTR gameplay request is unavailable.');
    this.kind = kind;
    this.code = isGameplay04ErrorCode(code) ? code : undefined;
  }
}

export function classifyGameplay04Error(error: unknown): Gameplay04ClientError {
  return isGameplay04ErrorCode(error)
    ? new Gameplay04ClientError(errorKinds[error], error)
    : new Gameplay04ClientError('uncertain');
}
