import type { InnerKeepFootprintClass } from './innerKeepPresentation';

export const INNER_KEEP_LAYOUT_V1_ID = 'genesis-001-inner-keep-v1';
export const INNER_KEEP_LAYOUT_V1_VERSION = 1;
export const INNER_KEEP_LAYOUT_V1_DIGEST =
  '67b0650d2fe4ac16b14fc1adb57911318fec82c5f4e7daeec83e0efb1ead8325';

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
 * Browser-pinned mirror of the v15 server layout policy. The scene resolves
 * positions by slot identity and accepts a presentation only when every row,
 * order, and the enclosing digest match this immutable contract.
 */
export const INNER_KEEP_LAYOUT_V1_SLOTS: readonly InnerKeepLayoutV1Slot[] =
  Object.freeze([
    Object.freeze({ slotId: 'inner-keep-slot-m01', footprintClass: 'medium', localXMicrounits: -7_000_000n, localZMicrounits: -3_200_000n, rotationMilliDegrees: 25_000, sortOrder: 1, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-m02', footprintClass: 'medium', localXMicrounits: -3_800_000n, localZMicrounits: -4_800_000n, rotationMilliDegrees: 15_000, sortOrder: 2, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-m03', footprintClass: 'medium', localXMicrounits: 3_800_000n, localZMicrounits: -4_800_000n, rotationMilliDegrees: 345_000, sortOrder: 3, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-m04', footprintClass: 'medium', localXMicrounits: 7_000_000n, localZMicrounits: -3_200_000n, rotationMilliDegrees: 335_000, sortOrder: 4, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-m05', footprintClass: 'medium', localXMicrounits: -7_200_000n, localZMicrounits: 1_900_000n, rotationMilliDegrees: 155_000, sortOrder: 5, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-m06', footprintClass: 'medium', localXMicrounits: -4_300_000n, localZMicrounits: 4_900_000n, rotationMilliDegrees: 170_000, sortOrder: 6, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-m07', footprintClass: 'medium', localXMicrounits: 4_300_000n, localZMicrounits: 4_900_000n, rotationMilliDegrees: 190_000, sortOrder: 7, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-m08', footprintClass: 'medium', localXMicrounits: 7_200_000n, localZMicrounits: 1_900_000n, rotationMilliDegrees: 205_000, sortOrder: 8, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-l01', footprintClass: 'large', localXMicrounits: -10_200_000n, localZMicrounits: -6_900_000n, rotationMilliDegrees: 35_000, sortOrder: 9, active: false }),
    Object.freeze({ slotId: 'inner-keep-slot-l02', footprintClass: 'large', localXMicrounits: 10_200_000n, localZMicrounits: -6_900_000n, rotationMilliDegrees: 325_000, sortOrder: 10, active: false }),
    Object.freeze({ slotId: 'inner-keep-slot-l03', footprintClass: 'large', localXMicrounits: -10_000_000n, localZMicrounits: 7_200_000n, rotationMilliDegrees: 145_000, sortOrder: 11, active: false }),
    Object.freeze({ slotId: 'inner-keep-slot-l04', footprintClass: 'large', localXMicrounits: 10_000_000n, localZMicrounits: 7_200_000n, rotationMilliDegrees: 215_000, sortOrder: 12, active: false })
  ]);

export const INNER_KEEP_LAYOUT_V1_SLOT_BY_ID: ReadonlyMap<
  string,
  InnerKeepLayoutV1Slot
> = new Map(
  INNER_KEEP_LAYOUT_V1_SLOTS.map((slot) => [slot.slotId, slot] as const)
);
