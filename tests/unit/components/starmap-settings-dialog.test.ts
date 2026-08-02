import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StarmapSettingsDialog } from "../../../components/settings/StarmapSettingsDialog";
import { StarArchivePlaceholderDialog } from "../../../components/starmap/StarArchivePlaceholderDialog";

describe("starmap utility dialogs", () => {
  it("keeps backup available and marks motion settings as unavailable", () => {
    const markup = renderToStaticMarkup(
      createElement(StarmapSettingsDialog, {
        isOpen: true,
        onClose: () => undefined,
        onOpenBackup: () => undefined,
      }),
    );

    expect(markup).toContain("设置");
    expect(markup).toContain("数据备份");
    expect(markup).toContain("动效");
    expect(markup).toContain("暂未开放");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>/u);
  });

  it("labels the archive as a placeholder without inventing content", () => {
    const markup = renderToStaticMarkup(
      createElement(StarArchivePlaceholderDialog, {
        isOpen: true,
        onClose: () => undefined,
      }),
    );

    expect(markup).toContain("星星仓库");
    expect(markup).toContain("暂未开放");
    expect(markup).not.toContain("示例星星");
  });
});
