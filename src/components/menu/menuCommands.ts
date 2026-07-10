export const menuCommands = [
  {
    id: 'enter-realm',
    label: 'ENTER REALM',
    notice: 'The Hegemony campaign is under construction. The gates of the realm will open soon.'
  },
  {
    id: 'continue',
    label: 'CONTINUE',
    notice: 'Campaign persistence is under construction. No saved realm can be resumed yet.'
  },
  {
    id: 'settings',
    label: 'SETTINGS',
    notice: 'Settings are under construction while the war council tunes the realm.'
  },
  {
    id: 'credits',
    label: 'CREDITS',
    notice: 'The chronicles and contributor roll are still under construction.'
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
