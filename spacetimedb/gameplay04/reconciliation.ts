import { commitGameplay04Revision, validateBinding04, validateTimestamp04 } from './commands';
import {
  reconcileConstructionWithoutRevision04,
  type ConstructionReconciliation04,
  type ConstructionStorage04,
} from './construction';
import { reconcileWorkersWithoutRevision04 } from './workers';
import type { KeepBinding04 } from './keep';

export function reconcileGameplayWithoutRevision04(
  storage: ConstructionStorage04,
  binding: KeepBinding04,
  now: bigint,
): ConstructionReconciliation04 {
  validateBinding04(binding);
  validateTimestamp04(now);
  const project = reconcileConstructionWithoutRevision04(storage, binding, now);
  const workers = reconcileWorkersWithoutRevision04(storage, binding, now, project.keep);
  return Object.freeze({
    keep: workers.keep,
    changed: project.changed || workers.changed,
  });
}

export function reconcileGameplay04(
  storage: ConstructionStorage04,
  binding: KeepBinding04,
  now: bigint,
): Readonly<{ changed: boolean; revision: bigint }> {
  const reconciled = reconcileGameplayWithoutRevision04(storage, binding, now);
  if (!reconciled.changed) {
    return Object.freeze({ changed: false, revision: reconciled.keep.revision });
  }
  const keep = commitGameplay04Revision(storage, reconciled.keep);
  return Object.freeze({ changed: true, revision: keep.revision });
}
