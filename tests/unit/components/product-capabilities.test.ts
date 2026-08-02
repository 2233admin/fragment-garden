import { describe, expect, it } from "vitest";

import { MVP_VOICE_INPUT_ENABLED } from "../../../lib/product-capabilities";

describe("MVP product capabilities", () => {
  it("keeps new voice input outside the ordinary MVP experience", () => {
    expect(MVP_VOICE_INPUT_ENABLED).toBe(false);
  });
});
