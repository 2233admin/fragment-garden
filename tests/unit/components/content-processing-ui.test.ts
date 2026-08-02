import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ContentProcessingDialog } from "../../../components/content-processing/ContentProcessingDialog";
import { ContentProcessingIndicator } from "../../../components/content-processing/ContentProcessingIndicator";
import { ImageDisclosureDialog } from "../../../components/fragments/ImageDisclosureDialog";
import { createLinkProcessingJobRecord } from "../services/content-processing-job-fixtures";

describe("content processing UI", () => {
  it("summarizes active, failed, and completed jobs with user-facing copy", () => {
    const activeMarkup = renderToStaticMarkup(
      createElement(ContentProcessingIndicator, {
        buttonRef: { current: null },
        jobs: [
          createLinkProcessingJobRecord({ id: "pending", status: "pending" }),
          createLinkProcessingJobRecord({ id: "processing", status: "processing" }),
        ],
        onOpen: vi.fn(),
      }),
    );
    const failedMarkup = renderToStaticMarkup(
      createElement(ContentProcessingIndicator, {
        buttonRef: { current: null },
        jobs: [createLinkProcessingJobRecord({ id: "failed", status: "failed" })],
        onOpen: vi.fn(),
      }),
    );
    const completedMarkup = renderToStaticMarkup(
      createElement(ContentProcessingIndicator, {
        buttonRef: { current: null },
        jobs: [createLinkProcessingJobRecord({ id: "completed", status: "completed" })],
        onOpen: vi.fn(),
      }),
    );

    expect(activeMarkup).toContain("正在整理 2 条内容");
    expect(failedMarkup).toContain("1 条内容需要处理");
    expect(completedMarkup).toContain("新笔记已经整理好了");
  });

  it("shows only the relevant task actions without leaking internal provider fields", () => {
    const markup = renderToStaticMarkup(
      createElement(ContentProcessingDialog, {
        busyJobId: null,
        errorMessage: null,
        isOpen: true,
        jobs: [
          createLinkProcessingJobRecord({
            id: "pending-job",
            processingRequestId: "private-request-id",
            providerTaskId: "private-provider-task",
            status: "pending",
          }),
          createLinkProcessingJobRecord({
            id: "pending-image-job",
            kind: "image",
            sourceFileName: "pending.png",
            sourceUrl: null,
            status: "pending",
          }),
          createLinkProcessingJobRecord({
            errorCode: "private-error-code",
            errorMessage: "private-provider-message",
            id: "failed-job",
            status: "failed",
          }),
          createLinkProcessingJobRecord({
            errorCode: "local_storage_full",
            errorMessage: "private-storage-detail",
            id: "quota-job",
            status: "failed",
          }),
          createLinkProcessingJobRecord({
            createdFragmentId: "fragment-1",
            id: "completed-job",
            resultTitle: "整理后的笔记",
            status: "completed",
          }),
        ],
        onCancel: vi.fn(),
        onClose: vi.fn(),
        onDelete: vi.fn(),
        onOpenCompleted: vi.fn(),
        onRetry: vi.fn(),
      }),
    );

    expect(markup).toContain("正在整理的内容");
    expect(markup).toContain("取消");
    expect(markup).toContain("继续整理");
    expect(markup).toContain("删除任务");
    expect(markup).toContain("重试");
    expect(markup).toContain("查看笔记");
    expect(markup).not.toContain("private-request-id");
    expect(markup).not.toContain("private-provider-task");
    expect(markup).not.toContain("private-error-code");
    expect(markup).not.toContain("private-provider-message");
    expect(markup).not.toContain("private-storage-detail");
    expect(markup).toContain("当前浏览器的本地存储空间不足");
    expect(markup).not.toContain("starmap-processing-visual");
  });

  it("reopens background work with the starmap black-hole states and real task actions", () => {
    const markup = renderToStaticMarkup(
      createElement(ContentProcessingDialog, {
        appearance: "starmap",
        busyJobId: null,
        errorMessage: null,
        isOpen: true,
        jobs: [
          createLinkProcessingJobRecord({ id: "waiting-link", status: "pending" }),
          createLinkProcessingJobRecord({ id: "active-link", status: "processing" }),
          createLinkProcessingJobRecord({ id: "failed-link", status: "failed" }),
          createLinkProcessingJobRecord({
            createdFragmentId: "real-fragment-id",
            id: "completed-link",
            resultTitle: "已经落进星空",
            status: "completed",
          }),
        ],
        onCancel: vi.fn(),
        onClose: vi.fn(),
        onDelete: vi.fn(),
        onOpenCompleted: vi.fn(),
        onRetry: vi.fn(),
      }),
    );

    expect(markup).toContain("memory-processing-hub");
    expect(markup).toContain('data-processing-visual-state="waiting"');
    expect(markup).toContain('data-processing-visual-state="active"');
    expect(markup).toContain('data-processing-visual-state="failed"');
    expect(markup).toContain('data-processing-visual-state="completed"');
    expect(markup.match(/data-testid="starmap-processing-visual"/gu)).toHaveLength(4);
    expect(markup).toContain('data-task-job-id="active-link"');
    expect(markup).toContain("取消任务");
    expect(markup).toContain("删除任务");
    expect(markup).toContain("重试");
    expect(markup).toContain("查看这颗星");
    expect(markup).not.toContain("查看笔记");
  });

  it("removes the local-only action from the new image creation disclosure", () => {
    const markup = renderToStaticMarkup(
      createElement(ImageDisclosureDialog, {
        allowLocalOnly: false,
        errorMessage: null,
        isOpen: true,
        isPending: false,
        onAccept: vi.fn(),
        onCancel: vi.fn(),
        onLocalOnly: vi.fn(),
      }),
    );

    expect(markup).toContain("<dialog");
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("同意并分析");
    expect(markup).toContain("取消");
    expect(markup).toContain("<dialog");
    expect(markup).toContain("autofocus");
    expect(markup).not.toContain("仅保存在本地");
  });
});
