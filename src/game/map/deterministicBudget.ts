export type DeterministicBudgetCandidate<T> = Readonly<{
  value: T;
  /** Lower groups win. Use this to preserve an established presentation area. */
  group: number;
  /** Stable unsigned rank within a group. Lower ranks win. */
  rank: number;
  /** Original encounter order, retained in the returned presentation order. */
  order: number;
}>;

function comparePriority<T>(
  left: DeterministicBudgetCandidate<T>,
  right: DeterministicBudgetCandidate<T>
) {
  return left.group - right.group
    || (left.rank >>> 0) - (right.rank >>> 0)
    || left.order - right.order;
}

function swap<T>(items: DeterministicBudgetCandidate<T>[], left: number, right: number) {
  const value = items[left]!;
  items[left] = items[right]!;
  items[right] = value;
}

/**
 * Streaming deterministic top-k collector. It retains only `limit` candidates
 * while scanning a much larger canonical world, so scenic allocation remains
 * bounded before any renderer objects are created.
 */
export function createDeterministicBudgetCollector<T>(limitInput: number) {
  const limit = Number.isFinite(limitInput)
    ? Math.max(0, Math.trunc(limitInput))
    : Number.MAX_SAFE_INTEGER;
  const heap: DeterministicBudgetCandidate<T>[] = [];

  const siftUp = (startIndex: number) => {
    let index = startIndex;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (comparePriority(heap[parent]!, heap[index]!) >= 0) break;
      swap(heap, parent, index);
      index = parent;
    }
  };

  const siftDown = (startIndex: number) => {
    let index = startIndex;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let largest = index;
      if (left < heap.length && comparePriority(heap[left]!, heap[largest]!) > 0) {
        largest = left;
      }
      if (right < heap.length && comparePriority(heap[right]!, heap[largest]!) > 0) {
        largest = right;
      }
      if (largest === index) return;
      swap(heap, index, largest);
      index = largest;
    }
  };

  return Object.freeze({
    add(candidate: DeterministicBudgetCandidate<T>) {
      if (limit === 0) return;
      if (heap.length < limit) {
        heap.push(candidate);
        siftUp(heap.length - 1);
        return;
      }
      if (comparePriority(candidate, heap[0]!) >= 0) return;
      heap[0] = candidate;
      siftDown(0);
    },
    values() {
      return [...heap]
        .sort((left, right) => left.order - right.order)
        .map((candidate) => candidate.value);
    }
  });
}
