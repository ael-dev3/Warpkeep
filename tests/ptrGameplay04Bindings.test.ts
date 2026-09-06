import { expect, it } from 'vitest';

import {
  procedures,
  type DbConnection,
} from '../spacetimedb/ptr/generated-bindings/index';

type PtrProcedures = InstanceType<typeof DbConnection>['procedures'];

const gameplayAccessors = [
  'initializeGameplay04KeepV1',
  'getGameplay04KeepV1',
  'dispatchGameplay04WorkerV1',
  'recallGameplay04WorkerV1',
  'startGameplay04BuildingV1',
] as const satisfies readonly (keyof PtrProcedures)[];

it('registers all five gameplay accessors with their exact public wire names', () => {
  // A missing or misregistered generated procedure must fail this boundary check.
  expect(Object.values(procedures)
    .filter(procedure => /gameplay/iu.test(procedure.name))
    .map(({ accessorName, name }) => [accessorName, name])
    .sort(([left], [right]) => left.localeCompare(right)))
    .toEqual([
      ['dispatchGameplay04WorkerV1', 'dispatch_gameplay04_worker_v1'],
      ['getGameplay04KeepV1', 'get_gameplay04_keep_v1'],
      ['initializeGameplay04KeepV1', 'initialize_gameplay04_keep_v1'],
      ['recallGameplay04WorkerV1', 'recall_gameplay04_worker_v1'],
      ['startGameplay04BuildingV1', 'start_gameplay04_building_v1'],
    ]);

  for (const accessor of gameplayAccessors) {
    expect(procedures).toHaveProperty(accessor);
  }
});
