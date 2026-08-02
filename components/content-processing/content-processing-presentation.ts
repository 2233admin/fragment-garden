import type { ContentProcessingJob } from "@/domain";
import { LOCAL_STORAGE_FULL_MESSAGE } from "../../services/local-persistence-error";

export function resolveProcessingTaskKind(job: ContentProcessingJob): string {
  if (job.kind === "image") return "图片";
  if (job.kind === "link") return "链接";
  return "发芽";
}

export function resolveProcessingTaskName(job: ContentProcessingJob): string {
  if (job.resultTitle?.trim()) return job.resultTitle.trim();
  if (job.kind === "image") return job.sourceFileName?.trim() || "图片内容";
  if (job.kind === "link" && job.sourceUrl !== null) {
    try {
      return new URL(job.sourceUrl).hostname.replace(/^www\./u, "");
    } catch {
      return "链接内容";
    }
  }
  if (job.kind === "sprout") return "正在发芽的新笔记";
  return "待整理内容";
}

export function resolveProcessingStatusCopy(job: ContentProcessingJob): string {
  if (job.status === "pending") {
    if (job.kind === "image") {
      return "原图已经保存在本地。继续整理后才会发送当前图片并创建正式笔记。";
    }
    return job.kind === "sprout"
      ? "正在准备从原笔记生成一条新笔记。完成后仍需你预览确认。"
      : "正在准备整理。你可以离开这里，稍后再回来查看。";
  }
  if (job.status === "processing") {
    return job.kind === "sprout"
      ? "正在发芽。生成和预览期间都不会创建卡片或植物。"
      : "正在整理这条内容。完成前不会创建正式笔记或记忆星。";
  }
  if (job.status === "failed") {
    if (job.errorCode === "local_storage_full") return LOCAL_STORAGE_FULL_MESSAGE;
    if (job.kind === "image") {
      return "这张图片暂时没能整理完成，原图仍保存在本地任务中。";
    }
    return job.kind === "sprout"
      ? "这次发芽没有完成，原笔记没有被修改，也没有创建新卡片。"
      : "这个链接暂时没能整理完成，没有留下空卡片。";
  }
  if (job.status === "completed") return "新笔记已经整理好了。";
  if (job.status === "awaiting_confirmation") {
    return job.kind === "sprout"
      ? "新笔记预览已经准备好，确认种下前仍不是正式卡片。"
      : "内容已经准备好，等待确认。";
  }
  return "这条任务已经取消。";
}

export function resolveProcessingStatusLabel(job: ContentProcessingJob): string {
  if (job.status === "pending") return "等待整理";
  if (job.status === "processing") return "正在整理";
  if (job.status === "failed") return "需要处理";
  if (job.status === "completed") return "整理完成";
  if (job.status === "awaiting_confirmation") return "等待确认";
  return "已取消";
}
