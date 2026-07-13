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
    id: 'exit',
    label: 'EXIT',
    notice: 'This passage is still under construction. Use Return to Title or press Escape.'
  }
] as const;

export type MenuCommand = (typeof menuCommands)[number];
export type MenuCommandId = MenuCommand['id'];

export function findMenuCommand(commandId: MenuCommandId) {
  return menuCommands.find((command) => command.id === commandId);
}
