let reducer: unknown;

export function linkGameplay04ScheduleV1(value: unknown): void {
  if (reducer !== undefined) throw new Error('GAMEPLAY04_SCHEDULE_ALREADY_LINKED');
  reducer = value;
}

export function getGameplay04ScheduleV1(): any {
  if (reducer === undefined) throw new Error('GAMEPLAY04_SCHEDULE_NOT_LINKED');
  return reducer;
}
