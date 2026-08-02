import { deriveLocalFragmentTitle, markdownToPlainText, type Fragment } from "../../domain";

export function isMemoryStarTitleVisuallyRedundant(
  contentType: Fragment["contentType"],
  title: string,
  contentMarkdown: string,
): boolean {
  if (contentType !== "text") return false;

  const plainText = markdownToPlainText(contentMarkdown);
  if (plainText.length === 0) return false;

  return title.trim() === deriveLocalFragmentTitle(plainText);
}
