import {
  deriveLocalFragmentTitle,
  markdownToPlainText,
  normalizeContentMarkdown,
  resolveFragmentContentMarkdown,
  type Fragment,
  type FragmentEvent,
  type Plant,
} from "../domain";
import { ExternalLinkImportRepository } from "../data/repositories/external-link-import-repository";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import { parseRestoredEventPayload } from "../validation/fragment-event-payload";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  requireFragmentCanInteract,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type UpdateFragmentContentInput = {
  fragmentId: string;
  title?: string;
  contentMarkdown: string;
  editedFields?: Readonly<{
    title: boolean;
    contentMarkdown: boolean;
  }>;
};

export type UpdateFragmentContentResult = {
  fragment: Fragment;
  plant: Plant;
  restoredEvent: FragmentEvent | null;
};

export async function updateFragmentContent(
  input: UpdateFragmentContentInput,
  dependencies: LocalServiceDependencies = {},
): Promise<UpdateFragmentContentResult> {
  const restoredPayload = parseRestoredEventPayload({ reason: "content_updated" });
  const { database, createId, timestamp } = resolveLocalServiceDependencies(dependencies);
  const fragmentRepository = new FragmentRepository(database);
  const plantRepository = new PlantRepository(database);
  const fragmentEventRepository = new FragmentEventRepository(database);
  const externalLinkImportRepository = new ExternalLinkImportRepository(database);

  return database.transaction(
    "rw",
    [database.fragments, database.plants, database.fragmentEvents, database.externalLinkImports],
    async () => {
      const [fragment, plant] = await Promise.all([
        fragmentRepository.getById(input.fragmentId),
        plantRepository.getByFragmentId(input.fragmentId),
      ]);

      if (fragment === undefined) {
        throw new Error(`Fragment ${input.fragmentId} was not found`);
      }

      if (plant === undefined) {
        throw new Error(`Plant for fragment ${input.fragmentId} was not found`);
      }

      requireFragmentCanInteract(fragment);

      const editedFields = input.editedFields ?? { title: true, contentMarkdown: true };
      const submittedContentMarkdown = normalizeContentMarkdown(input.contentMarkdown);
      const contentMarkdown = editedFields.contentMarkdown
        ? submittedContentMarkdown
        : resolveFragmentContentMarkdown(fragment);
      if (contentMarkdown.length === 0) throw new Error("Fragment content cannot be empty");

      const manualTitle = input.title?.trim();
      const plainText = markdownToPlainText(contentMarkdown);
      const title = editedFields.title
        ? manualTitle === undefined || manualTitle.length === 0
          ? plainText.length === 0
            ? fragment.title
            : deriveLocalFragmentTitle(plainText)
          : manualTitle
        : fragment.title;
      const wasDormant = fragment.lifecycleStatus === "dormant";
      const isArchived = fragment.lifecycleStatus === "archived";
      const stage = fragment.completionStatus === "completed" ? "permanent_bloom" : plant.stage;
      const slotId = isArchived ? null : plant.slotId;
      const shouldUpdatePlant =
        plant.vitality !== "active" || plant.stage !== stage || plant.slotId !== slotId;
      const updatedFragment: Fragment = {
        ...fragment,
        title,
        contentMarkdown,
        lifecycleStatus: isArchived ? "archived" : "active",
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
      };
      const updatedPlant: Plant = shouldUpdatePlant
        ? {
            ...plant,
            stage,
            vitality: "active",
            slotId,
            updatedAt: timestamp,
          }
        : plant;
      const restoredEvent: FragmentEvent | null = wasDormant
        ? {
            id: createId(),
            fragmentId: fragment.id,
            type: "restored",
            payload: restoredPayload,
            occurredAt: timestamp,
            ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
          }
        : null;

      requireRecordUpdated(
        await fragmentRepository.update(fragment.id, {
          title,
          contentMarkdown,
          lifecycleStatus: updatedFragment.lifecycleStatus,
          updatedAt: timestamp,
          lastInteractedAt: timestamp,
        }),
        "Fragment",
      );

      if (updatedPlant !== plant) {
        requireRecordUpdated(
          await plantRepository.update(plant.id, {
            stage,
            vitality: "active",
            slotId,
            updatedAt: timestamp,
          }),
          "Plant",
        );
      }

      if (restoredEvent !== null) {
        await fragmentEventRepository.add(restoredEvent);
      }

      if (fragment.contentType === "link") {
        const externalLinkImport = await externalLinkImportRepository.getByFragmentId(fragment.id);

        if (externalLinkImport !== undefined) {
          const userProvidedTitle =
            externalLinkImport.userProvidedTitle ||
            (editedFields.title && title !== fragment.title);
          const userProvidedContent =
            externalLinkImport.userProvidedContent ||
            (editedFields.contentMarkdown &&
              contentMarkdown !== resolveFragmentContentMarkdown(fragment, externalLinkImport));

          requireRecordUpdated(
            await externalLinkImportRepository.update(externalLinkImport.id, {
              userProvidedTitle,
              userProvidedContent,
              updatedAt: timestamp,
            }),
            "ExternalLinkImport",
          );
        }
      }

      return {
        fragment: updatedFragment,
        plant: updatedPlant,
        restoredEvent,
      };
    },
  );
}
