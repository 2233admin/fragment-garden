import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LinkImportApiClient,
  LinkImportApiClientError,
} from "../../../services/link-import-api-client";

function createFetchMock(): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>();
}

async function expectApiClientError(
  promise: Promise<unknown>,
  expectedCode: LinkImportApiClientError["code"],
): Promise<LinkImportApiClientError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(LinkImportApiClientError);
    expect((error as LinkImportApiClientError).code).toBe(expectedCode);
    return error as LinkImportApiClientError;
  }

  throw new Error("Expected LinkImportApiClientError");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LinkImportApiClient", () => {
  it("uses only the fixed start route and validates its success contract", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue(
      Response.json({
        status: "pending",
        taskId: "task-1",
        requestId: "request-1",
      }),
    );
    const client = new LinkImportApiClient(fetchMock);
    const abortController = new AbortController();

    await expect(
      client.start("https://example.com/article", abortController.signal),
    ).resolves.toEqual({
      status: "pending",
      taskId: "task-1",
      requestId: "request-1",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/link-imports/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/article" }),
      signal: abortController.signal,
    });
  });

  it("uses only the fixed progress route and accepts a completed payload", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue(
      Response.json({
        status: "completed",
        externalNoteId: "external-note-1",
        title: "标题",
        summary: "摘要",
        sourceContent: "正文",
        canonicalUrl: "https://example.com/article",
        truncated: false,
        requestId: null,
      }),
    );
    const client = new LinkImportApiClient(fetchMock);

    await expect(client.getProgress("task-1")).resolves.toMatchObject({
      status: "completed",
      externalNoteId: "external-note-1",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/link-imports/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: "task-1" }),
      signal: undefined,
    });
  });

  it("preserves normalized server errors without reading an unknown raw body", async () => {
    const fetchMock = createFetchMock();
    fetchMock
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: "quota_exceeded",
              message: "链接读取额度暂时不足，请稍后再试。",
              requestId: "quota-request",
            },
          },
          { status: 429 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            providerError: "secret upstream body",
          },
          { status: 502 },
        ),
      );
    const client = new LinkImportApiClient(fetchMock);

    const normalizedError = await expectApiClientError(
      client.start("https://example.com/quota"),
      "quota_exceeded",
    );
    const unknownError = await expectApiClientError(
      client.start("https://example.com/unknown"),
      "invalid_provider_response",
    );

    expect(normalizedError.requestId).toBe("quota-request");
    expect(normalizedError.message).toBe("链接读取额度暂时不足，请稍后再试。");
    expect(unknownError.message).not.toContain("secret upstream body");
  });

  it("rejects malformed success JSON and response bodies", async () => {
    const fetchMock = createFetchMock();
    fetchMock
      .mockResolvedValueOnce(Response.json({ status: "completed", unexpected: true }))
      .mockResolvedValueOnce(new Response("not-json"));
    const client = new LinkImportApiClient(fetchMock);

    await expectApiClientError(
      client.start("https://example.com/invalid-contract"),
      "invalid_provider_response",
    );
    await expectApiClientError(
      client.start("https://example.com/invalid-json"),
      "invalid_provider_response",
    );
  });

  it("maps fetch rejection to a safe network error", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockRejectedValue(new TypeError("socket details must stay private"));
    const client = new LinkImportApiClient(fetchMock);

    const error = await expectApiClientError(
      client.start("https://example.com/network"),
      "network_error",
    );
    expect(error.message).not.toContain("socket details");
  });
});
