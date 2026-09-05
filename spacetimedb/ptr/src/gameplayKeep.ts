import { SenderError, t } from 'spacetimedb/server';

import {
  Gameplay04KeepError,
  initializeKeep04,
  readKeep04,
} from '../../gameplay04/keep';
import { observeJourney04 } from '../../gameplay04/workerJourney';
import {
  Gameplay04WorkerError,
  reconcileWorkers04,
} from '../../gameplay04/workers';
import { requirePtrOwner } from './auth';
import {
  requirePtrReadyAtlas,
  type PtrReadyAtlas,
} from './atlasReadReducers';
import { gameplay04Binding, gameplay04WorkerStorage } from './gameplayWorkers';
import ptr from './schema';

const gameplay04RoutePointV1 = t.object('Gameplay04RoutePointProjectionV1', {
  q: t.i32(), r: t.i32(),
});

const gameplay04AssignmentStateV1 = t.object('Gameplay04AssignmentStateV1', {
  locationId: t.string(),
  destinationCellKey: t.string(),
  resource: t.string(),
  route: t.array(gameplay04RoutePointV1),
  dispatchedAt: t.i64(),
  routeEdges: t.u32(),
  travelPerEdgeMicros: t.i64(),
  gatheringDurationMicros: t.i64(),
  yieldPerQuantum: t.u64(),
  recalledAt: t.option(t.i64()),
  phase: t.string(),
  arrivesAt: t.i64(),
  gatheringStopsAt: t.i64(),
  returnsAt: t.i64(),
  earned: t.u64(),
});

const gameplay04ReturnOutcomeV1 = t.object('Gameplay04ReturnOutcomeProjectionV1', {
  assignmentRevision: t.u64(),
  resource: t.string(),
  returnedAtMicros: t.i64(),
  earned: t.u64(),
  credited: t.u64(),
  overflow: t.u64(),
});

const gameplay04WorkerStateV1 = t.object('Gameplay04WorkerStateV1', {
  ordinal: t.u32(),
  assignmentRevision: t.u64(),
  assignment: t.option(gameplay04AssignmentStateV1),
  lastReturn: t.option(gameplay04ReturnOutcomeV1),
});

const gameplay04KeepStateV1 = t.object('Gameplay04KeepStateV1', {
  policyVersion: t.string(),
  revision: t.u64(),
  lastAcceptedSequence: t.u64(),
  food: t.u64(),
  wood: t.u64(),
  stone: t.u64(),
  gold: t.u64(),
  workers: t.array(gameplay04WorkerStateV1),
});

const gameplay04InitializeResultV1 = t.object('Gameplay04InitializeResultV1', {
  sequence: t.u64(),
  revision: t.u64(),
});

function sender(error: unknown, fallback: string): never {
  if (error instanceof Gameplay04KeepError || error instanceof Gameplay04WorkerError) {
    throw new SenderError(error.code);
  }
  if (error instanceof SenderError) throw error;
  throw new SenderError(fallback);
}

export const initializeGameplay04KeepV1 = ptr.procedure(
  { name: 'initialize_gameplay04_keep_v1' },
  {
    sequence: t.u64(),
    requestKey: t.string(),
    expectedRevision: t.u64(),
    policyVersion: t.string(),
  },
  gameplay04InitializeResultV1,
  (ctx, input) => {
    try {
      return ctx.withTx(tx => {
        const { claims } = requirePtrOwner(tx);
        const atlas = requirePtrReadyAtlas(tx);
        return initializeKeep04(
          gameplay04WorkerStorage(tx),
          gameplay04Binding(tx, claims.fid, atlas),
          tx.timestamp.microsSinceUnixEpoch,
          input,
        );
      });
    } catch (error) {
      return sender(error, 'GAMEPLAY04_INITIALIZE_FAILED');
    }
  },
);

export const getGameplay04KeepV1 = ptr.procedure(
  { name: 'get_gameplay04_keep_v1' },
  gameplay04KeepStateV1,
  ctx => {
    try {
      return ctx.withTx(tx => {
        const { claims } = requirePtrOwner(tx);
        const atlas = requirePtrReadyAtlas(tx);
        const binding = gameplay04Binding(tx, claims.fid, atlas);
        const store = gameplay04WorkerStorage(tx);
        reconcileWorkers04(store, binding, tx.timestamp.microsSinceUnixEpoch);
        const state = readKeep04(
          store,
          binding,
        );
        return {
          policyVersion: state.keep.policyVersion,
          revision: state.keep.revision,
          lastAcceptedSequence: state.keep.lastAcceptedSequence,
          food: state.keep.food,
          wood: state.keep.wood,
          stone: state.keep.stone,
          gold: state.keep.gold,
          workers: state.workers.map(worker => {
            const assignment = worker.assignment;
            const observed = assignment === undefined
              ? undefined
              : observeJourney04(assignment.journey, tx.timestamp.microsSinceUnixEpoch);
            return {
              ordinal: worker.ordinal,
              assignmentRevision: worker.assignmentRevision,
              assignment: assignment === undefined || observed === undefined ? undefined : {
                locationId: assignment.locationId,
                destinationCellKey: assignment.destinationCellKey,
                resource: assignment.journey.resource,
                route: assignment.route.map(point => ({ q: point.q, r: point.r })),
                dispatchedAt: assignment.journey.dispatchedAt,
                routeEdges: assignment.journey.routeEdges,
                travelPerEdgeMicros: assignment.journey.travelPerEdgeMicros,
                gatheringDurationMicros: assignment.journey.gatheringDurationMicros,
                yieldPerQuantum: assignment.journey.yieldPerQuantum,
                recalledAt: assignment.journey.recalledAt ?? undefined,
                phase: observed.phase,
                arrivesAt: observed.arrivesAt,
                gatheringStopsAt: observed.gatheringStopsAt,
                returnsAt: observed.returnsAt,
                earned: observed.earned,
              },
              lastReturn: worker.lastReturn,
            };
          }),
        };
      });
    } catch (error) {
      return sender(error, 'GAMEPLAY04_READ_FAILED');
    }
  },
);
