import { SenderError } from 'spacetimedb/server';

import genesis002 from './schema';
import { gameplay04ScheduleV1 } from './gameplaySchema';
import { linkGameplay04ScheduleV1 } from './gameplayScheduleLink';

export const runGameplay04ScheduleV1 = genesis002.reducer(
  { name: 'run_gameplay_04_schedule_v_1' },
  { arg: gameplay04ScheduleV1.rowType },
  () => { throw new SenderError('GENESIS002_GAMEPLAY_CLOSED'); },
);

linkGameplay04ScheduleV1(runGameplay04ScheduleV1);
