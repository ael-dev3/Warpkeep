export type RealmSurfaceDisturbanceKind = 'grass' | 'water';

export type RealmSurfaceDisturbanceInput = Readonly<{
  kind: RealmSurfaceDisturbanceKind;
  x: number;
  z: number;
  radius: number;
  strength: number;
  createdAtSeconds: number;
  lifetimeSeconds: number;
}>;

export type RealmSurfaceDisturbanceSnapshot = Readonly<{
  count: number;
  /** Packed x/z centers. Storage is stable for the lifetime of the field. */
  centers: Float32Array;
  /** Packed radius/current-strength/normalized-age/lifetime values. */
  params: Float32Array;
}>;

export type RealmSurfaceDisturbanceTelemetry = Readonly<{
  capacity: number;
  activeGrassCount: number;
  activeWaterCount: number;
  insertedCount: number;
  droppedCount: number;
}>;

export type RealmSurfaceDisturbanceField = Readonly<{
  push: (input: RealmSurfaceDisturbanceInput) => boolean;
  snapshot: (
    kind: RealmSurfaceDisturbanceKind,
    seconds: number,
    maximumSlots: number
  ) => RealmSurfaceDisturbanceSnapshot;
  getTelemetry: (seconds: number) => RealmSurfaceDisturbanceTelemetry;
  clear: () => void;
  dispose: () => void;
}>;

const MAX_FIELD_CAPACITY = 16;
const MAX_SNAPSHOT_SLOTS = 8;

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function createRealmSurfaceDisturbanceField(
  requestedCapacity: number
): RealmSurfaceDisturbanceField {
  const capacity = Math.min(
    MAX_FIELD_CAPACITY,
    Math.max(0, Math.trunc(finite(requestedCapacity)))
  );
  const kinds = new Uint8Array(capacity);
  const x = new Float32Array(capacity);
  const z = new Float32Array(capacity);
  const radius = new Float32Array(capacity);
  const strength = new Float32Array(capacity);
  const createdAt = new Float64Array(capacity);
  const lifetime = new Float32Array(capacity);
  const occupied = new Uint8Array(capacity);
  const scratchIndices = new Int16Array(capacity);
  const grassCenters = new Float32Array(MAX_SNAPSHOT_SLOTS * 2);
  const grassParams = new Float32Array(MAX_SNAPSHOT_SLOTS * 4);
  const waterCenters = new Float32Array(MAX_SNAPSHOT_SLOTS * 2);
  const waterParams = new Float32Array(MAX_SNAPSHOT_SLOTS * 4);
  let insertedCount = 0;
  let droppedCount = 0;
  let disposed = false;

  const kindCode = (kind: RealmSurfaceDisturbanceKind) => kind === 'water' ? 2 : 1;
  const isAlive = (index: number, seconds: number) => occupied[index] === 1
    && seconds >= createdAt[index]!
    && seconds - createdAt[index]! < lifetime[index]!;

  const clearExpired = (seconds: number) => {
    for (let index = 0; index < capacity; index += 1) {
      if (occupied[index] === 1 && !isAlive(index, seconds)) occupied[index] = 0;
    }
  };

  return Object.freeze({
    push: (input) => {
      if (disposed || capacity === 0) return false;
      const inputKind = kindCode(input.kind);
      const inputX = finite(input.x);
      const inputZ = finite(input.z);
      const inputRadius = Math.max(0.05, Math.min(4, finite(input.radius, 0.5)));
      const inputStrength = Math.max(0, Math.min(1, finite(input.strength)));
      const inputCreatedAt = Math.max(0, finite(input.createdAtSeconds));
      const inputLifetime = Math.max(0.05, Math.min(8, finite(input.lifetimeSeconds, 1)));
      if (inputStrength <= 0) return false;
      clearExpired(inputCreatedAt);
      let target = -1;
      let oldestTime = Number.POSITIVE_INFINITY;
      for (let index = 0; index < capacity; index += 1) {
        if (occupied[index] === 0) {
          target = index;
          break;
        }
        if (createdAt[index]! < oldestTime) {
          oldestTime = createdAt[index]!;
          target = index;
        }
      }
      if (target < 0) {
        droppedCount += 1;
        return false;
      }
      if (occupied[target] === 1) droppedCount += 1;
      kinds[target] = inputKind;
      x[target] = inputX;
      z[target] = inputZ;
      radius[target] = inputRadius;
      strength[target] = inputStrength;
      createdAt[target] = inputCreatedAt;
      lifetime[target] = inputLifetime;
      occupied[target] = 1;
      insertedCount += 1;
      return true;
    },
    snapshot: (kind, seconds, maximumSlots) => {
      const safeSeconds = Math.max(0, finite(seconds));
      const slots = Math.min(
        MAX_SNAPSHOT_SLOTS,
        Math.max(0, Math.trunc(finite(maximumSlots)))
      );
      const centers = kind === 'water' ? waterCenters : grassCenters;
      const params = kind === 'water' ? waterParams : grassParams;
      centers.fill(0);
      params.fill(0);
      if (disposed || slots === 0) return Object.freeze({ count: 0, centers, params });
      clearExpired(safeSeconds);
      const code = kindCode(kind);
      let candidateCount = 0;
      for (let index = 0; index < capacity; index += 1) {
        if (isAlive(index, safeSeconds) && kinds[index] === code) {
          scratchIndices[candidateCount] = index;
          candidateCount += 1;
        }
      }
      // Small fixed pool: stable insertion sort keeps newest disturbances.
      for (let index = 1; index < candidateCount; index += 1) {
        const candidate = scratchIndices[index]!;
        let cursor = index - 1;
        while (cursor >= 0 && createdAt[scratchIndices[cursor]!]! < createdAt[candidate]!) {
          scratchIndices[cursor + 1] = scratchIndices[cursor]!;
          cursor -= 1;
        }
        scratchIndices[cursor + 1] = candidate;
      }
      const count = Math.min(slots, candidateCount);
      for (let slot = 0; slot < count; slot += 1) {
        const source = scratchIndices[slot]!;
        const age = Math.max(0, safeSeconds - createdAt[source]!);
        const normalizedAge = Math.min(1, age / lifetime[source]!);
        centers[slot * 2] = x[source]!;
        centers[slot * 2 + 1] = z[source]!;
        params[slot * 4] = radius[source]!;
        params[slot * 4 + 1] = strength[source]! * (1 - normalizedAge);
        params[slot * 4 + 2] = normalizedAge;
        params[slot * 4 + 3] = lifetime[source]!;
      }
      return Object.freeze({ count, centers, params });
    },
    getTelemetry: (seconds) => {
      const safeSeconds = Math.max(0, finite(seconds));
      if (!disposed) clearExpired(safeSeconds);
      let activeGrassCount = 0;
      let activeWaterCount = 0;
      for (let index = 0; index < capacity; index += 1) {
        if (!isAlive(index, safeSeconds)) continue;
        if (kinds[index] === 1) activeGrassCount += 1;
        if (kinds[index] === 2) activeWaterCount += 1;
      }
      return Object.freeze({
        capacity,
        activeGrassCount,
        activeWaterCount,
        insertedCount,
        droppedCount
      });
    },
    clear: () => {
      occupied.fill(0);
      grassCenters.fill(0);
      grassParams.fill(0);
      waterCenters.fill(0);
      waterParams.fill(0);
    },
    dispose: () => {
      disposed = true;
      occupied.fill(0);
    }
  });
}
