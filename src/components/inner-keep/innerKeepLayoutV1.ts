import type { InnerKeepFootprintClass } from './innerKeepPresentation';

export const INNER_KEEP_LAYOUT_V1_ID = 'genesis-001-inner-keep-v1';
export const INNER_KEEP_LAYOUT_V1_VERSION = 1;
export const INNER_KEEP_LAYOUT_V1_DIGEST =
  '1b3a452794c28f8d7f8814ce6064da8582725d34bb0ee0271d51f40c2fbdfad7';

export type InnerKeepLayoutV1Slot = Readonly<{
  slotId: string;
  footprintClass: InnerKeepFootprintClass;
  localXMicrounits: bigint;
  localZMicrounits: bigint;
  rotationMilliDegrees: number;
  sortOrder: number;
  active: boolean;
}>;

/**
 * Empty compatibility mirror for code that still imports the retired slot
 * catalogue. Free placement is governed by innerKeepFreePlacementPolicy and
 * no runtime presentation or scene resolves a building through a slot.
 */
export const INNER_KEEP_LAYOUT_V1_SLOTS: readonly InnerKeepLayoutV1Slot[] =
  Object.freeze([]);

export const INNER_KEEP_LAYOUT_V1_SLOT_BY_ID: ReadonlyMap<
  string,
  InnerKeepLayoutV1Slot
> = new Map(
  INNER_KEEP_LAYOUT_V1_SLOTS.map((slot) => [slot.slotId, slot] as const)
);
