export const menuCommands = [
  {
    id: 'enter-realm',
    label: 'ENTER REALM',
    notice: 'The living frontier is not yet open on this device.'
  },
  {
    id: 'settings',
    label: 'SETTINGS',
    notice: undefined
  },
  {
    id: 'credits',
    label: 'CREDITS',
    notice: undefined
  },
  {
    id: 'patch-notes',
    label: 'PATCH NOTES',
    notice: undefined
  }
] as const;

export type MenuCommand = (typeof menuCommands)[number];
export type MenuCommandId = MenuCommand['id'];

export function findMenuCommand(commandId: MenuCommandId) {
  return menuCommands.find((command) => command.id === commandId);
}
