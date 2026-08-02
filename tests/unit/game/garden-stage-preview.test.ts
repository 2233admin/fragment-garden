import { describe, expect, it } from "vitest";

import { resolveGardenStagePreview } from "../../../game/config/garden-stage-preview";

describe("garden stage development preview", () => {
  it.each([0, 1, 2, 3, 4] as const)("accepts stage %i in development", (stage) => {
    expect(resolveGardenStagePreview(`?gardenStage=${stage}`, "development")).toBe(stage);
  });

  it("ignores missing or invalid values", () => {
    expect(resolveGardenStagePreview("", "development")).toBeNull();
    expect(resolveGardenStagePreview("?gardenStage=-1", "development")).toBeNull();
    expect(resolveGardenStagePreview("?gardenStage=5", "development")).toBeNull();
    expect(resolveGardenStagePreview("?gardenStage=2.5", "development")).toBeNull();
  });

  it("ignores the preview parameter outside development", () => {
    expect(resolveGardenStagePreview("?gardenStage=4", "production")).toBeNull();
    expect(resolveGardenStagePreview("?gardenStage=4", "test")).toBeNull();
    expect(resolveGardenStagePreview("?gardenStage=4", undefined)).toBeNull();
  });
});
