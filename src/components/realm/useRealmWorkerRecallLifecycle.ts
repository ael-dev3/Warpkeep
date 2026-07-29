import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import { emitWarpkeepSfx } from '../audio/sfxEvents';
import {
  realmWorkerCanRecall,
  type RealmWorkerPublicPresentation
} from './realmWorkerPresentation';

const WORKER_RECONCILIATION_TIMEOUT_MILLISECONDS = 12_000;

type PendingWorkerRecall = Readonly<{
  attempt: number;
  fid: number;
}>;

type PendingRecallAll = Readonly<{
  attempt: number;
  fid: number;
  workerIds: readonly string[];
}>;

export type RealmWorkerRecallLifecycle = Readonly<{
  awaitingWorkerIds: ReadonlySet<string>;
  recallAllAwaitingAuthority: boolean;
  recallWorker?: (workerId: string) => Promise<void>;
  recallAllWorkers?: () => Promise<void>;
}>;

/**
 * Owns recall submission state above every Realm inspector. The public Worker
 * graph remains the sole reconciliation authority, so closing one surface and
 * opening another cannot submit the same current lifecycle twice.
 */
export function useRealmWorkerRecallLifecycle(input: Readonly<{
  identityFid: number;
  workers: readonly RealmWorkerPublicPresentation[];
  onRecallWorker?: (workerId: string) => Promise<void>;
  onRecallAllWorkers?: () => Promise<void>;
}>): RealmWorkerRecallLifecycle {
  const workersRef = useRef(input.workers);
  const identityFidRef = useRef(input.identityFid);
  const recallWorkerRef = useRef(input.onRecallWorker);
  const recallAllWorkersRef = useRef(input.onRecallAllWorkers);
  const attemptSequenceRef = useRef(0);
  const pendingWorkersRef = useRef(new Map<string, PendingWorkerRecall>());
  const pendingRecallAllRef = useRef<PendingRecallAll | undefined>(undefined);
  const workerTimersRef = useRef(new Map<string, number>());
  const recallAllTimerRef = useRef<number | undefined>(undefined);
  const [awaitingWorkerIds, setAwaitingWorkerIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [recallAllAwaitingAuthority, setRecallAllAwaitingAuthority] =
    useState(false);
  workersRef.current = input.workers;
  identityFidRef.current = input.identityFid;
  recallWorkerRef.current = input.onRecallWorker;
  recallAllWorkersRef.current = input.onRecallAllWorkers;

  const publishPendingWorkers = useCallback(() => {
    setAwaitingWorkerIds(new Set(pendingWorkersRef.current.keys()));
  }, []);

  const clearWorker = useCallback((workerId: string) => {
    pendingWorkersRef.current.delete(workerId);
    const timer = workerTimersRef.current.get(workerId);
    if (timer !== undefined) window.clearTimeout(timer);
    workerTimersRef.current.delete(workerId);
    publishPendingWorkers();
  }, [publishPendingWorkers]);

  const clearRecallAll = useCallback(() => {
    pendingRecallAllRef.current = undefined;
    if (recallAllTimerRef.current !== undefined) {
      window.clearTimeout(recallAllTimerRef.current);
      recallAllTimerRef.current = undefined;
    }
    setRecallAllAwaitingAuthority(false);
  }, []);

  const workerStatusSignature = input.workers
    .map((worker) => `${worker.workerId}:${worker.status}`)
    .sort()
    .join('|');

  useEffect(() => {
    const workersById = new Map(
      workersRef.current.map((worker) => [worker.workerId, worker] as const)
    );
    let changed = false;
    for (const workerId of pendingWorkersRef.current.keys()) {
      const status = workersById.get(workerId)?.status;
      if (status !== 'returning' && status !== 'idle') continue;
      pendingWorkersRef.current.delete(workerId);
      const timer = workerTimersRef.current.get(workerId);
      if (timer !== undefined) window.clearTimeout(timer);
      workerTimersRef.current.delete(workerId);
      changed = true;
    }
    if (changed) publishPendingWorkers();

    const recallAll = pendingRecallAllRef.current;
    if (
      recallAll !== undefined
      && recallAll.workerIds.every((workerId) => {
        const status = workersById.get(workerId)?.status;
        return status === 'returning' || status === 'idle';
      })
    ) {
      clearRecallAll();
    }
  }, [clearRecallAll, publishPendingWorkers, workerStatusSignature]);

  useEffect(() => {
    attemptSequenceRef.current += 1;
    pendingWorkersRef.current.clear();
    pendingRecallAllRef.current = undefined;
    for (const timer of workerTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    workerTimersRef.current.clear();
    if (recallAllTimerRef.current !== undefined) {
      window.clearTimeout(recallAllTimerRef.current);
      recallAllTimerRef.current = undefined;
    }
    setAwaitingWorkerIds(new Set());
    setRecallAllAwaitingAuthority(false);
  }, [input.identityFid]);

  useEffect(() => () => {
    attemptSequenceRef.current += 1;
    pendingWorkersRef.current.clear();
    pendingRecallAllRef.current = undefined;
    for (const timer of workerTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    workerTimersRef.current.clear();
    if (recallAllTimerRef.current !== undefined) {
      window.clearTimeout(recallAllTimerRef.current);
    }
  }, []);

  const recallWorker = useCallback(async (workerId: string) => {
    const command = recallWorkerRef.current;
    const fid = identityFidRef.current;
    const worker = workersRef.current.find(
      (candidate) => candidate.workerId === workerId
    );
    if (
      command === undefined
      || !worker?.ownedByViewer
      || !realmWorkerCanRecall(worker)
      || pendingWorkersRef.current.has(workerId)
      || pendingRecallAllRef.current !== undefined
    ) {
      throw new Error('Worker command is unavailable.');
    }

    const attempt = attemptSequenceRef.current + 1;
    attemptSequenceRef.current = attempt;
    pendingWorkersRef.current.set(workerId, Object.freeze({ attempt, fid }));
    publishPendingWorkers();
    try {
      await command(workerId);
      const pending = pendingWorkersRef.current.get(workerId);
      if (
        pending?.attempt !== attempt
        || pending.fid !== fid
        || identityFidRef.current !== fid
      ) return;
      const status = workersRef.current.find(
        (candidate) => candidate.workerId === workerId
      )?.status;
      if (status === 'returning' || status === 'idle') {
        clearWorker(workerId);
        return;
      }
      const retainedTimer = workerTimersRef.current.get(workerId);
      if (retainedTimer !== undefined) window.clearTimeout(retainedTimer);
      const timer = window.setTimeout(() => {
        const current = pendingWorkersRef.current.get(workerId);
        if (current?.attempt !== attempt || current.fid !== fid) return;
        clearWorker(workerId);
      }, WORKER_RECONCILIATION_TIMEOUT_MILLISECONDS);
      workerTimersRef.current.set(workerId, timer);
    } catch {
      const pending = pendingWorkersRef.current.get(workerId);
      if (pending?.attempt === attempt && pending.fid === fid) {
        clearWorker(workerId);
        emitWarpkeepSfx({ kind: 'command-failed' });
      }
      throw new Error('Worker command is unavailable.');
    }
  }, [clearWorker, publishPendingWorkers]);

  const recallAllWorkers = useCallback(async () => {
    const command = recallAllWorkersRef.current;
    const fid = identityFidRef.current;
    const workerIds = workersRef.current
      .filter((worker) => worker.ownedByViewer && realmWorkerCanRecall(worker))
      .map((worker) => worker.workerId)
      .sort();
    if (
      command === undefined
      || workerIds.length === 0
      || pendingWorkersRef.current.size > 0
      || pendingRecallAllRef.current !== undefined
    ) {
      throw new Error('Worker command is unavailable.');
    }

    const attempt = attemptSequenceRef.current + 1;
    attemptSequenceRef.current = attempt;
    const pending = Object.freeze({
      attempt,
      fid,
      workerIds: Object.freeze(workerIds)
    });
    pendingRecallAllRef.current = pending;
    setRecallAllAwaitingAuthority(true);
    try {
      await command();
      if (
        pendingRecallAllRef.current !== pending
        || identityFidRef.current !== fid
      ) return;
      const workersById = new Map(
        workersRef.current.map((worker) => [worker.workerId, worker] as const)
      );
      if (workerIds.every((workerId) => {
        const status = workersById.get(workerId)?.status;
        return status === 'returning' || status === 'idle';
      })) {
        clearRecallAll();
        return;
      }
      if (recallAllTimerRef.current !== undefined) {
        window.clearTimeout(recallAllTimerRef.current);
      }
      recallAllTimerRef.current = window.setTimeout(() => {
        if (pendingRecallAllRef.current !== pending) return;
        clearRecallAll();
      }, WORKER_RECONCILIATION_TIMEOUT_MILLISECONDS);
    } catch {
      if (pendingRecallAllRef.current === pending) {
        clearRecallAll();
        emitWarpkeepSfx({ kind: 'command-failed' });
      }
      throw new Error('Worker command is unavailable.');
    }
  }, [clearRecallAll]);

  return Object.freeze({
    awaitingWorkerIds,
    recallAllAwaitingAuthority,
    ...(input.onRecallWorker === undefined ? {} : { recallWorker }),
    ...(input.onRecallAllWorkers === undefined ? {} : { recallAllWorkers })
  });
}
