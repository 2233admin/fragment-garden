import { describe, expect, it } from "vitest";

function add(left: number, right: number): number {
  return left + right;
}

describe("test environment", () => {
  it("runs a pure function", () => {
    expect(add(2, 3)).toBe(5);
  });
});
