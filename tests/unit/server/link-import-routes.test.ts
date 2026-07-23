import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST as getProgress } from "../../../app/api/link-imports/progress/route";
import { POST as startImport } from "../../../app/api/link-imports/start/route";

function createRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createProviderResponse(
  data: unknown,
  options: {
    requestId?: string;
    success?: boolean;
    status?: number;
    error?: unknown;
  } = {},
): Response {
  return Response.json(
    {
      success: options.success ?? true,
      data,
      error: options.error ?? null,
      request_id: options.requestId ?? "provider-request",
    },
    {
      status: options.status ?? 200,
    },
  );
}

describe("link import Route Handlers", () => {
  beforeEach(() => {
    process.env.GETNOTE_LINK_IMPORT_ENABLED = "true";
    process.env.GETNOTE_API_KEY = "test-api-key";
    process.env.GETNOTE_CLIENT_ID = "test-client-id";
  });

  afterEach(() => {
    delete process.env.GETNOTE_LINK_IMPORT_ENABLED;
    delete process.env.GETNOTE_API_KEY;
    delete process.env.GETNOTE_CLIENT_ID;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["start", startImport],
    ["progress", getProgress],
  ] as const)(
    "rejects non-JSON %s requests before calling the provider",
    async (_name, handler) => {
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchMock);
      const response = await handler(
        new Request("http://localhost/api/link-imports", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ url: "https://example.com/article", taskId: "task-1" }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "invalid_request" },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("returns service_unavailable without calling fetch when disabled", async () => {
    process.env.GETNOTE_LINK_IMPORT_ENABLED = "false";
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const response = await startImport(
      createRequest("/api/link-imports/start", {
        url: "https://example.com/article",
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "service_unavailable",
        message: "链接读取服务暂未启用或配置不完整。",
        requestId: null,
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unsafe URL before calling the provider", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const response = await startImport(
      createRequest("/api/link-imports/start", {
        url: "http://127.0.0.1/private",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "invalid_request",
        requestId: null,
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a pending task from the async save operation", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      createProviderResponse(
        {
          note_id: null,
          task_id: "task-1",
        },
        { requestId: "save-request" },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await startImport(
      createRequest("/api/link-imports/start", {
        url: "https://example.com/article",
      }),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "pending",
      taskId: "task-1",
      requestId: "save-request",
    });
  });

  it("immediately fetches and returns detail after a synchronous save", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const providerTitle = `🌱`.repeat(205);
    fetchMock
      .mockResolvedValueOnce(
        createProviderResponse({
          note_id: "1907975006118548200",
          task_id: null,
        }),
      )
      .mockResolvedValueOnce(
        createProviderResponse(
          {
            note: {
              note_id: "1907975006118548200",
              title: providerTitle,
              web_page: {
                content: "网页正文",
                url: "https://example.com/article",
                excerpt: "网页摘要",
              },
            },
          },
          { requestId: "detail-request" },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await startImport(
      createRequest("/api/link-imports/start", {
        url: "https://example.com/article",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: "completed",
      externalNoteId: "1907975006118548200",
      title: `🌱`.repeat(200),
      summary: "网页摘要",
      sourceContent: "网页正文",
      canonicalUrl: "https://example.com/article",
      truncated: false,
      requestId: "detail-request",
    });
    expect([...body.title]).toHaveLength(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns pending and processing progress without reading detail", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(createProviderResponse({ status: "pending" }))
      .mockResolvedValueOnce(createProviderResponse({ status: "processing" }));
    vi.stubGlobal("fetch", fetchMock);

    const pendingResponse = await getProgress(
      createRequest("/api/link-imports/progress", { taskId: "task-1" }),
    );
    const processingResponse = await getProgress(
      createRequest("/api/link-imports/progress", { taskId: "task-1" }),
    );

    await expect(pendingResponse.json()).resolves.toEqual({
      status: "pending",
      requestId: "provider-request",
    });
    await expect(processingResponse.json()).resolves.toEqual({
      status: "processing",
      requestId: "provider-request",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reads detail after successful progress and returns only the public fields", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(
        createProviderResponse({
          status: "success",
          note_id: "1907975006118548200",
        }),
      )
      .mockResolvedValueOnce(
        createProviderResponse({
          note: {
            id: "1907975006118548200",
            note_id: "1907975006118548200",
            title: "完成标题",
            account_private_field: "must-not-leak",
            web_page: {
              content: "完成正文",
              url: "https://example.com/complete",
              excerpt: "完成摘要",
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getProgress(
      createRequest("/api/link-imports/progress", { taskId: "task-1" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "completed",
      externalNoteId: "1907975006118548200",
      title: "完成标题",
      summary: "完成摘要",
      sourceContent: "完成正文",
      canonicalUrl: "https://example.com/complete",
      truncated: false,
      requestId: "provider-request",
    });
    expect(JSON.stringify(body)).not.toContain("must-not-leak");
  });

  it("normalizes provider task failure and retains request_id", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      createProviderResponse(
        {
          status: "failed",
          internal_message: "private provider detail",
        },
        { requestId: "failed-request" },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getProgress(
      createRequest("/api/link-imports/progress", { taskId: "task-1" }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: {
        code: "provider_processing_failed",
        message: "得到大脑暂时无法读取这个链接。",
        requestId: "failed-request",
      },
    });
    expect(JSON.stringify(body)).not.toContain("private provider detail");
  });
});
