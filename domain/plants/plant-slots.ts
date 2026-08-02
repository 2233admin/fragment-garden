export const PLANT_SLOT_IDS: readonly string[] = Object.freeze(
  Array.from({ length: 36 }, (_, index) => `slot-${String(index + 1).padStart(2, "0")}`),
);

export function allocateFirstAvailablePlantSlot(
  allSlotIds: readonly string[],
  occupiedSlotIds: readonly (string | null)[],
): string | null {
  const occupiedSlots = new Set<string>();

  for (const slotId of occupiedSlotIds) {
    if (slotId !== null) {
      occupiedSlots.add(slotId);
    }
  }

  return allSlotIds.find((slotId) => !occupiedSlots.has(slotId)) ?? null;
}
