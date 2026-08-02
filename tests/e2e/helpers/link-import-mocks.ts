import type { Page, Route } from "@playwright/test";

export type LinkImportMockResponse = Readonly<{
  body: unknown;
  status?: number;
}>;

export type LinkImportStartCall = Readonly<{
  callIndex: number;
  url: string;
}>;

export type LinkImportProgressCall = Readonly<{
  callIndex: number;
  taskId: string;
}>;

export type LinkImportMockHandlers = Readonly<{
  onProgress: (
    call: LinkImportProgressCall,
  ) => LinkImportMockResponse | Promise<LinkImportMockResponse>;
  onStart: (call: LinkImportStartCall) => LinkImportMockResponse | Promise<LinkImportMockResponse>;
}>;

export type LinkImportMockTrace = {
  progressTaskIds: string[];
  startUrls: string[];
};

function readStringField(body: unknown, fieldName: string): string {
  if (
    typeof body !== "object" ||
    body === null ||
    !(fieldName in body) ||
    typeof body[fieldName as keyof typeof body] !== "string"
  ) {
    throw new Error(`Expected ${fieldName} in mocked link import request`);
  }

  return body[fieldName as keyof typeof body] as string;
}

async function fulfillJson(route: Route, response: LinkImportMockResponse): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(response.body),
    contentType: "application/json",
    status: response.status ?? 200,
  });
}

export async function mockLinkImportRoutes(
  page: Page,
  handlers: LinkImportMockHandlers,
): Promise<LinkImportMockTrace> {
  const trace: LinkImportMockTrace = {
    progressTaskIds: [],
    startUrls: [],
  };

  await page.route("**/api/link-imports/start", async (route) => {
    const url = readStringField(route.request().postDataJSON(), "url");
    trace.startUrls.push(url);
    await fulfillJson(
      route,
      await handlers.onStart({
        callIndex: trace.startUrls.length,
        url,
      }),
    );
  });
  await page.route("**/api/link-imports/progress", async (route) => {
    const taskId = readStringField(route.request().postDataJSON(), "taskId");
    trace.progressTaskIds.push(taskId);
    await fulfillJson(
      route,
      await handlers.onProgress({
        callIndex: trace.progressTaskIds.length,
        taskId,
      }),
    );
  });

  return trace;
}
