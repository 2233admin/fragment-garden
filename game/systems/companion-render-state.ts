import type { CompanionViewModel } from "../../domain/garden/companion-view-model";

export type CompanionRenderOperation =
  | Readonly<{ type: "none" }>
  | Readonly<{ type: "create"; companion: CompanionViewModel }>
  | Readonly<{ type: "replace"; companion: CompanionViewModel }>
  | Readonly<{ type: "remove" }>;

export function calculateCompanionRenderOperation(
  previousCompanion: CompanionViewModel | null,
  nextCompanion: CompanionViewModel | null,
): CompanionRenderOperation {
  if (previousCompanion === null) {
    return nextCompanion === null ? { type: "none" } : { type: "create", companion: nextCompanion };
  }

  if (nextCompanion === null) {
    return { type: "remove" };
  }

  return previousCompanion.type === nextCompanion.type
    ? { type: "none" }
    : { type: "replace", companion: nextCompanion };
}
