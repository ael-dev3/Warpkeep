import { setGlobalLogLevel } from 'spacetimedb';

export function configureHermesMachineOutput(machineReadable: boolean): void {
  setGlobalLogLevel(machineReadable ? 'error' : 'info');
}
