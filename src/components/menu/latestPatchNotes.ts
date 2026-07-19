export type LatestPatchNotes = Readonly<{
  releasedOn: string;
  title: string;
  summary: string;
  highlights: readonly string[];
  alphaNotice: string;
}>;

const ALPHA_0_3_11_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '19 JUL 2026',
  title: 'THE FRONTIER STIRS',
  summary:
    'The first supply wagons now cross a greener Genesis 001, carrying its founding keeps one step closer to a living strategy world.',
  highlights: Object.freeze([
    'Gold Mines, Wheat Farms, and Logging Camps now belong to the shared map. Founders may send one private, server-governed wagon to each resource type.',
    'A shared forest and wind-tossed Lowlands give the frontier more character while leaving terrain, roads, castle ownership, and resource authority unchanged.',
    'Resource icons explain what is live, what remains private, and what is still being built. Stone continues as keep terrain yield only; Quarry art is visual groundwork.',
    'Castle names and portraits remain public presentation, never ownership authority. A profile update or clear cannot take a founded keep away from its player.',
    'Construction, upgrades, armies, combat, trading, and resource spending are not playable yet. Community Marks remain separate and carry no reward or financial promise.'
  ]),
  alphaNotice:
    'Alpha 0.3.11 is experimental. The core strategy loop is still being built, and the world may change with testing and community feedback.'
});

export const WARPKEEP_PATCH_NOTES_BY_VERSION: Readonly<Record<string, LatestPatchNotes>> =
  Object.freeze({
    '0.3.11': ALPHA_0_3_11_PATCH_NOTES
  });

export function getLatestPatchNotes(productVersion: string) {
  return Object.hasOwn(WARPKEEP_PATCH_NOTES_BY_VERSION, productVersion)
    ? WARPKEEP_PATCH_NOTES_BY_VERSION[productVersion]
    : undefined;
}
