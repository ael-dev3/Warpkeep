import { SenderError, t } from 'spacetimedb/server';

import {
  GAMEPLAY04_LAYOUT_DIGEST,
  GAMEPLAY04_LAYOUT_VERSION,
  Gameplay04ConstructionError,
  validateConstructionState04,
} from '../../gameplay04/construction';
import {
  Gameplay04KeepError,
  initializeKeep04,
  readKeep04,
} from '../../gameplay04/keep';
import { observeJourney04 } from '../../gameplay04/workerJourney';
import {
  Gameplay04WorkerError,
} from '../../gameplay04/workers';
import { reconcileGameplay04 } from '../../gameplay04/reconciliation';
import { buildingDuration04, gatheringYield04, travelPerEdge04 } from '../../gameplay04/policy';
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

const gameplay04BuildingStateV1 = t.object('Gameplay04BuildingStateV1', {
  kind: t.string(),
  x: t.i64(),
  z: t.i64(),
  rotation: t.u32(),
  completedLevel: t.u32(),
  revision: t.u64(),
});

const gameplay04CostStateV1 = t.object('Gameplay04CostStateV1', {
  food: t.u64(), wood: t.u64(), stone: t.u64(), gold: t.u64(),
});

const gameplay04ProjectStateV1 = t.object('Gameplay04ProjectStateV1', {
  kind: t.string(),
  projectRevision: t.u64(),
  targetLevel: t.u32(),
  startedAtMicros: t.i64(),
  completesAtMicros: t.i64(),
  cost: gameplay04CostStateV1,
  durationMicros: t.i64(),
});

const gameplay04CompletedLevelsV1 = t.object('Gameplay04CompletedLevelsV1', {
  mill: t.u32(),
  lumberCamp: t.u32(),
  stoneworks: t.u32(),
  goldworks: t.u32(),
  barracks: t.u32(),
  cathedral: t.u32(),
});

const gameplay04CompletedEffectsV1 = t.object('Gameplay04CompletedEffectsV1', {
  foodYieldPerQuantum: t.u64(),
  woodYieldPerQuantum: t.u64(),
  stoneYieldPerQuantum: t.u64(),
  goldYieldPerQuantum: t.u64(),
  travelPerEdgeMicros: t.i64(),
  levelOneBuildDurationMicros: t.i64(),
});

const gameplay04KeepStateV1 = t.object('Gameplay04KeepStateV1', {
  policyVersion: t.string(),
  layoutVersion: t.string(),
  layoutDigest: t.string(),
  revision: t.u64(),
  lastAcceptedSequence: t.u64(),
  food: t.u64(),
  wood: t.u64(),
  stone: t.u64(),
  gold: t.u64(),
  workers: t.array(gameplay04WorkerStateV1),
  buildings: t.array(gameplay04BuildingStateV1),
  project: t.option(gameplay04ProjectStateV1),
  completedLevels: gameplay04CompletedLevelsV1,
  completedEffects: gameplay04CompletedEffectsV1,
});

const gameplay04InitializeResultV1 = t.object('Gameplay04InitializeResultV1', {
  sequence: t.u64(),
  revision: t.u64(),
});

function sender(error: unknown, fallback: string): never {
  if (
    error instanceof Gameplay04KeepError
    || error instanceof Gameplay04WorkerError
    || error instanceof Gameplay04ConstructionError
  ) {
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
        reconcileGameplay04(store, binding, tx.timestamp.microsSinceUnixEpoch);
        const state = readKeep04(
          store,
          binding,
        );
        const construction = validateConstructionState04(store, binding);
        const projectBuilding = construction.project === null
          ? undefined
          : construction.buildings.find(row => row.buildingId === construction.project!.buildingId);
        const completed = construction.completed;
        return {
          policyVersion: state.keep.policyVersion,
          layoutVersion: GAMEPLAY04_LAYOUT_VERSION,
          layoutDigest: GAMEPLAY04_LAYOUT_DIGEST,
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
          buildings: construction.buildings.map(building => ({
            kind: building.kind,
            x: building.x,
            z: building.z,
            rotation: building.rotation,
            completedLevel: building.completedLevel,
            revision: building.revision,
          })),
          project: construction.project === null || projectBuilding === undefined ? undefined : {
            kind: projectBuilding.kind,
            projectRevision: construction.project.projectRevision,
            targetLevel: construction.project.targetLevel,
            startedAtMicros: construction.project.startedAtMicros,
            completesAtMicros: construction.project.completesAtMicros,
            cost: construction.project.cost,
            durationMicros: construction.project.durationMicros,
          },
          completedLevels: {
            mill: completed['city-mill'],
            lumberCamp: completed['lumber-camp'],
            stoneworks: completed['city-stoneworks'],
            goldworks: completed['city-goldworks'],
            barracks: completed['city-barracks'],
            cathedral: completed['grand-covenant-cathedral'],
          },
          completedEffects: {
            foodYieldPerQuantum: gatheringYield04('food', completed),
            woodYieldPerQuantum: gatheringYield04('wood', completed),
            stoneYieldPerQuantum: gatheringYield04('stone', completed),
            goldYieldPerQuantum: gatheringYield04('gold', completed),
            travelPerEdgeMicros: travelPerEdge04(completed),
            levelOneBuildDurationMicros: buildingDuration04(1, completed),
          },
        };
      });
    } catch (error) {
      return sender(error, 'GAMEPLAY04_READ_FAILED');
    }
  },
);
