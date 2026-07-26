import { describe, expect, it } from "vitest";

import {
  isQuotaExceededError,
  LOCAL_STORAGE_FULL_MESSAGE,
  localPersistenceErrorMessage,
} from "../../../services/local-persistence-error";

describe("local persistence errors", () => {
  it("recognizes native and nested Dexie quota errors", () => {
    const quotaError = new DOMException("Storage is full", "QuotaExceededError");

    expect(isQuotaExceededError(quotaError)).toBe(true);
    expect(
      isQuotaExceededError({ name: "BulkError", failures: [new Error("other"), quotaError] }),
    ).toBe(true);
    expect(
      isQuotaExceededError({ name: "DatabaseClosedError", inner: { cause: quotaError } }),
    ).toBe(true);
    expect(isQuotaExceededError(new Error("ordinary failure"))).toBe(false);
  });

  it("uses one safe user message without exposing wrapped storage details", () => {
    const wrapped = { name: "BulkError", cause: { name: "QuotaExceededError" } };

    expect(localPersistenceErrorMessage(wrapped, "fallback")).toBe(LOCAL_STORAGE_FULL_MESSAGE);
    expect(localPersistenceErrorMessage(new Error("provider requestId=secret"), "fallback")).toBe(
      "fallback",
    );
  });
});
