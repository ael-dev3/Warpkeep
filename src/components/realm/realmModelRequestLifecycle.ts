export type SharedRealmModelRequest<T> = {
  abortController: AbortController;
  consumerCount: number;
  promise: Promise<T>;
  settled: boolean;
};

export function createRealmLoadAbortError(label: string) {
  const error = new Error(`${label} load was cancelled.`);
  error.name = 'AbortError';
  return error;
}

export function throwIfRealmLoadAborted(
  signal: AbortSignal | undefined,
  label: string
) {
  if (signal?.aborted) throw createRealmLoadAbortError(label);
}

/**
 * Gives one caller a cancellable view of a shared request. Cancellation only
 * aborts the shared transport after its final pending consumer leaves.
 */
export function consumeSharedRealmModelRequest<T>(
  request: SharedRealmModelRequest<T>,
  signal: AbortSignal | undefined,
  onAbandoned: () => void,
  label: string
): Promise<T> {
  if (signal?.aborted) return Promise.reject(createRealmLoadAbortError(label));
  request.consumerCount += 1;

  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true;
      signal?.removeEventListener('abort', onAbort);
      request.consumerCount -= 1;
      if (request.consumerCount === 0 && !request.settled) onAbandoned();
      return true;
    };
    const onAbort = () => {
      if (!finish()) return;
      reject(createRealmLoadAbortError(label));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    request.promise.then(
      (value) => {
        if (!finish()) return;
        resolve(value);
      },
      (error: unknown) => {
        if (!finish()) return;
        reject(error);
      }
    );
  });
}
