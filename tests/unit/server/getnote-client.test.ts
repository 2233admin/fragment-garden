import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createGetNoteClient,
  GETNOTE_REQUEST_TIMEOUT_MS,
} from "../../../lib/server/getnote/getnote-client";
import { GetNoteError } from "../../../lib/server/getnote/getnote-errors";
import { GETNOTE_RESPONSE_MAX_BYTES } from "../../../lib/server/getnote/safe-json";

const TEST_CONFIGURATION = {
  apiKey: "test-api-key",
  clientId: "test-client-id",
};

function createProviderResponse(
  data: unknown,
  options: {
    status?: number;
    success?: boolean;
    error?: unknown;
    requestId?: string;
    headers?: HeadersInit;
  } = {},
): Response {
  return new Response(
    JSON.stringify({
      success: options.success ?? true,
      data,
      error: options.error ?? null,
      meta: { timestamp: 1_782_962_708 },
      request_id: options.requestId ?? "request-1",
    }),
    {
      status: options.status ?? 200,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    },
  );
}

async function expectGetNoteErrorCode(
  promise: Promise<unknown>,
  code: GetNoteError["code"],
): Promise<GetNoteError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(GetNoteError);
    expect((error as GetNoteError).code).toBe(code);
    return error as GetNoteError;
  }

  throw new Error("Expected GetNoteError");
}

describe("GetNote client", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("submits only the fixed save-link operation and parses direct task_id", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      createProviderResponse(
        {
          note_id: null,
          task_id: "task-direct",
        },
        { requestId: "save-request" },
      ),
    );
    const client = createGetNoteClient(TEST_CONFIGURATION, fetchMock);

    await expect(client.saveLink("https://example.com/article")).resolves.toEqual({
      status: "pending",
      taskId: "task-direct",
      requestId: "save-request",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    expect(String(requestUrl)).toBe("https://openapi.biji.com/open/api/v1/resource/note/save");
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.headers).toMatchObject({
      Authorization: "test-api-key",
      "X-Client-ID": "test-client-id",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      note_type: "link",
      link_url: "https://example.com/article",
    });
  });

  it("accepts the second official save response shape with tasks", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      createProviderResponse({
        created_count: 1,
        tasks: [
          {
            task_id: "task-list",
            url: "https://example.com/article",
          },
        ],
      }),
    );
    const client = createGetNoteClient(TEST_CONFIGURATION, fetchMock);

    await expect(client.saveLink("https://example.com/article")).resolves.toEqual({
      status: "pending",
      taskId: "task-list",
      requestId: "request-1",
    });
  });

  it("accepts a synchronous save result without manufacturing a task", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      createProviderResponse({
        note_id: "1907975006118548200",
        task_id: null,
      }),
    );
    const client = createGetNoteClient(TEST_CONFIGURATION, fetchMock);

    await expect(client.saveLink("https://example.com/article")).resolves.toEqual({
      status: "completed",
      externalNoteId: "1907975006118548200",
      requestId: "request-1",
    });
  });

  it.each(["pending", "processing", "failed"] as const)(
    "parses the %s task state without requiring note_id",
    async (status) => {
      const fetchMock = vi.fn<typeof fetch>();
      fetchMock.mockResolvedValue(createProviderResponse({ status }));
      const client = createGetNoteClient(TEST_CONFIGURATION, fetchMock);

      await expect(client.getTaskProgress("task-1")).resolves.toEqual({
        status,
        requestId: "request-1",
      });
    },
  );

  it("returns the exact successful int64 note ID as a string", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      new Response(
        `{
          "success": true,
          "data": {
            "status": "success",
            "note_id": 9223372036854775807
          },
          "error": null,
          "request_id": "progress-request"
        }`,
      ),
    );
    const client = createGetNoteClient(TEST_CONFIGURATION, fetchMock);

    await expect(client.getTaskProgress("task-1")).resolves.toEqual({
      status: "success",
      externalNoteId: "9223372036854775807",
      requestId: "progress-request",
    });
  });

  it("parses detail, protects int64 IDs, validates the URL and truncates public text", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const title = ` 标题${"题".repeat(205)} `;
    const summary = `摘要${"要".repeat(20_005)}`;
    const sourceContent = `正文${"文".repeat(200_005)}`;
    fetchMock.mockResolvedValue(
      new Response(`{
        "success": true,
        "data": {
          "note": {
            "id": 9223372036854775807,
            "note_id": 9223372036854775807,
            "title": ${JSON.stringify(title)},
            "web_page": {
              "content": ${JSON.stringify(sourceContent)},
              "url": "https://EXAMPLE.com/article",
              "excerpt": ${JSON.stringify(summary)}
            }
          }
        },
        "error": null,
        "request_id": "detail-request"
      }`),
    );
    const client = createGetNoteClient(TEST_CONFIGURATION, fetchMock);

    const result = await client.getNoteDetail("9223372036854775807");

    expect(result.externalNoteId).toBe("9223372036854775807");
    expect([...result.title]).toHaveLength(200);
    expect([...result.summary]).toHaveLength(20_000);
    expect([...result.sourceContent]).toHaveLength(200_000);
    expect(result.canonicalUrl).toBe("https://example.com/article");
    expect(result.truncated).toBe(true);
    expect(result.requestId).toBe("detail-request");

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://openapi.biji.com/open/api/v1/resource/note/detail?id=9223372036854775807",
    );
  });

  it("rejects an unsafe canonical URL returned by the provider", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      createProviderResponse({
        note: {
          note_id: "123",
          title: "标题",
          web_page: {
            content: "正文",
            url: "http://127.0.0.1/private",
            excerpt: "摘要",
          },
        },
      }),
    );
    const client = createGetNoteClient(TEST_CONFIGURATION, fetchMock);

    await expectGetNoteErrorCode(client.getNoteDetail("123"), "invalid_provider_response");
  });

  it("normalizes non-member, QPS and quota failures without exposing credentials", async () => {
    const responses = [
      createProviderResponse(null, {
        status: 403,
        success: false,
        error: { code: 10201, reason: "not_member" },
        requestId: "membership-request",
      }),
      createProviderResponse(null, {
        status: 429,
        success: false,
        error: { code: 10202, reason: "qps_global_exceeded" },
      }),
      createProviderResponse(null, {
        status: 429,
        success: false,
        error: { code: 10203, reason: "quota_daily_exceeded" },
      }),
    ];
    const fetchMock = vi.fn<typeof fetch>();
    for (const response of responses) {
      fetchMock.mockResolvedValueOnce(response);
    }
    const client = createGetNoteClient(TEST_CONFIGURATION, fetchMock);

    const membershipError = await expectGetNoteErrorCode(
      client.saveLink("https://example.com/1"),
      "membership_required",
    );
    await expectGetNoteErrorCode(client.saveLink("https://example.com/2"), "rate_limited");
    await expectGetNoteErrorCode(client.saveLink("https://example.com/3"), "quota_exceeded");

    expect(membershipError.requestId).toBe("membership-request");
    expect(membershipError.message).not.toContain(TEST_CONFIGURATION.apiKey);
    expect(membershipError.message).not.toContain(TEST_CONFIGURATION.clientId);
  });

  it("aborts a provider request after 30 seconds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const client = createGetNoteClient(TEST_CONFIGURATION, fetchMock);
    const request = client.saveLink("https://example.com/article");
    const assertion = expectGetNoteErrorCode(request, "processing_timeout");

    await vi.advanceTimersByTimeAsync(GETNOTE_REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it("rejects invalid and oversized provider responses", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(new Response('{"success":true,"data":{"unexpected":true}}'))
      .mockResolvedValueOnce(
        new Response("", {
          headers: {
            "Content-Length": String(GETNOTE_RESPONSE_MAX_BYTES + 1),
          },
        }),
      );
    const client = createGetNoteClient(TEST_CONFIGURATION, fetchMock);

    await expectGetNoteErrorCode(
      client.saveLink("https://example.com/invalid"),
      "invalid_provider_response",
    );
    await expectGetNoteErrorCode(
      client.saveLink("https://example.com/large"),
      "invalid_provider_response",
    );
  });

  it("rejects detail for a different note than the one requested", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      createProviderResponse({
        note: {
          note_id: "different-note",
          title: "标题",
          web_page: {
            content: "正文",
            url: "https://example.com/article",
            excerpt: "摘要",
          },
        },
      }),
    );
    const client = createGetNoteClient(TEST_CONFIGURATION, fetchMock);

    await expectGetNoteErrorCode(
      client.getNoteDetail("requested-note"),
      "invalid_provider_response",
    );
  });

  it("normalizes rejected fetch calls as network errors", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockRejectedValue(new TypeError("socket failed"));
    const client = createGetNoteClient(TEST_CONFIGURATION, fetchMock);

    await expectGetNoteErrorCode(client.saveLink("https://example.com/article"), "network_error");
  });
});
