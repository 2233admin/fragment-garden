import type { FragmentCompletionStatus, FragmentLifecycleStatus, PlantStage } from "@/domain";

export const COMPLETION_STATUS_LABELS: Readonly<Record<FragmentCompletionStatus, string>> = {
  open: "未完成",
  completed: "已完成",
};

export const LIFECYCLE_STATUS_LABELS: Readonly<Record<FragmentLifecycleStatus, string>> = {
  active: "活跃",
  dormant: "休眠",
  archived: "封存",
  deleted: "已删除",
};

export const PLANT_STAGE_LABELS: Readonly<Record<PlantStage, string>> = {
  seedling: "幼苗",
  growing: "生长",
  budding: "含苞",
  blooming: "盛开",
  permanent_bloom: "永久盛开",
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatFragmentTimestamp(timestamp: string): string {
  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? "时间未知" : DATE_TIME_FORMATTER.format(date);
}

export function resolveGrowthStep(stage: PlantStage): number {
  switch (stage) {
    case "seedling":
      return 0;
    case "growing":
      return 1;
    case "budding":
      return 2;
    case "blooming":
    case "permanent_bloom":
      return 3;
  }
}
