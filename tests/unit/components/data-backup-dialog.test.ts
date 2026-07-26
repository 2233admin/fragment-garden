import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DataBackupDialog } from "../../../components/backup/DataBackupDialog";
import { GardenBackupError, gardenBackupErrorMessage } from "../../../services/garden-backup";

describe("DataBackupDialog", () => {
  it("uses a low-frequency, plain-language backup surface with keyboard-native controls", () => {
    const markup = renderToStaticMarkup(
      createElement(DataBackupDialog, {
        isOpen: true,
        onClose: () => undefined,
        onRestoreCompleted: () => undefined,
      }),
    );

    expect(markup).toContain("数据与备份");
    expect(markup).toContain("导出备份");
    expect(markup).toContain("从备份恢复");
    expect(markup).toContain("选择碎片花园备份文件");
    expect(markup).toContain("保存在当前浏览器中");
    expect(markup).not.toMatch(/IndexedDB|Dexie|Schema|MediaAsset|ContentProcessingJob/u);
  });

  it("maps validation and rollback failures to user-safe copy", () => {
    expect(gardenBackupErrorMessage(new GardenBackupError("incomplete_backup"))).toBe(
      "备份文件不完整或已损坏。",
    );
    expect(gardenBackupErrorMessage(new GardenBackupError("restore_failed"))).toBe(
      "恢复没有完成，你原来的花园没有被修改。请稍后重试。",
    );
    expect(gardenBackupErrorMessage(new Error("Dexie requestId provider"))).not.toMatch(
      /Dexie|requestId|provider/u,
    );
  });
});
