import { describe, expect, it } from "vitest";

import {
  allocateFirstAvailablePlantSlot,
  PLANT_SLOT_IDS,
} from "../../../domain/plants/plant-slots";

describe("PLANT_SLOT_IDS", () => {
  it("contains the 36 stable slot identifiers in order", () => {
    expect(PLANT_SLOT_IDS).toEqual([
      "slot-01",
      "slot-02",
      "slot-03",
      "slot-04",
      "slot-05",
      "slot-06",
      "slot-07",
      "slot-08",
      "slot-09",
      "slot-10",
      "slot-11",
      "slot-12",
      "slot-13",
      "slot-14",
      "slot-15",
      "slot-16",
      "slot-17",
      "slot-18",
      "slot-19",
      "slot-20",
      "slot-21",
      "slot-22",
      "slot-23",
      "slot-24",
      "slot-25",
      "slot-26",
      "slot-27",
      "slot-28",
      "slot-29",
      "slot-30",
      "slot-31",
      "slot-32",
      "slot-33",
      "slot-34",
      "slot-35",
      "slot-36",
    ]);
  });
});

describe("allocateFirstAvailablePlantSlot", () => {
  it("returns the first configured slot when none are occupied", () => {
    expect(allocateFirstAvailablePlantSlot(["slot-03", "slot-01"], [])).toBe("slot-03");
  });

  it("skips occupied slots", () => {
    expect(
      allocateFirstAvailablePlantSlot(["slot-01", "slot-02", "slot-03"], ["slot-01", "slot-03"]),
    ).toBe("slot-02");
  });

  it("returns null when every slot is occupied", () => {
    expect(
      allocateFirstAvailablePlantSlot(["slot-01", "slot-02"], ["slot-01", "slot-02"]),
    ).toBeNull();
  });

  it("does not treat null as an occupied slot", () => {
    expect(allocateFirstAvailablePlantSlot(["slot-01", "slot-02"], [null, "slot-01"])).toBe(
      "slot-02",
    );
  });
});
