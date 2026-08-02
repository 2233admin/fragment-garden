import {
  PLANT_SLOT_IDS,
  allocateFirstAvailablePlantSlot,
  deriveLocalFragmentTitle,
  normalizeContentMarkdown,
  plainTextToMarkdown,
  type Fragment,
  type FragmentEvent,
  type Plant,
} from "../domain";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type CreateLocalFragmentInput = {
  title?: string;
  rawText: string;
  contentMarkdown?: string;
};

export type CreateLocalFragmentResult = {
  fragment: Fragment;
  plant: Plant;
  createdEvent: FragmentEvent;
};

export type CreateLocalFragmentDependencies = LocalServiceDependencies;

export async function createLocalFragment(
  input: CreateLocalFragmentInput,
  dependencies: CreateLocalFragmentDependencies = {},
): Promise<CreateLocalFragmentResult> {
  if (input.rawText.trim().length === 0) {
    throw new Error("Fragment text cannot be empty");
  }

  const manualTitle = input.title?.trim();
  const title =
    manualTitle === undefined || manualTitle.length === 0
      ? deriveLocalFragmentTitle(input.rawText)
      : manualTitle;
  const contentMarkdown = normalizeContentMarkdown(
    input.contentMarkdown ?? plainTextToMarkdown(input.rawText),
  );
  if (contentMarkdown.length === 0) {
    throw new Error("Fragment content cannot be empty");
  }
  const { database, createId, timestamp } = resolveLocalServiceDependencies(dependencies);

  const fragmentRepository = new FragmentRepository(database);
  const plantRepository = new PlantRepository(database);
  const fragmentEventRepository = new FragmentEventRepository(database);

  return database.transaction(
    "rw",
    database.fragments,
    database.plants,
    database.fragmentEvents,
    async () => {
      const occupiedSlotIds = (await plantRepository.list()).map((plant) => plant.slotId);

      const fragment: Fragment = {
        id: createId(),
        contentType: "text",
        title,
        rawText: input.rawText,
        sourceUrl: null,
        contentMarkdown,
        summary: null,
        keywords: [],
        lifecycleStatus: "active",
        completionStatus: "open",
        analysisStatus: "not_required",
        embedding: null,
        parentFragmentId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
        completedAt: null,
      };

      const plant: Plant = {
        id: createId(),
        fragmentId: fragment.id,
        speciesId: null,
        stage: "seedling",
        vitality: "active",
        growthScore: 0,
        slotId: allocateFirstAvailablePlantSlot(PLANT_SLOT_IDS, occupiedSlotIds),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const createdEvent: FragmentEvent = {
        id: createId(),
        fragmentId: fragment.id,
        type: "created",
        payload: null,
        occurredAt: timestamp,
        ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
      };

      await fragmentRepository.add(fragment);
      await plantRepository.add(plant);
      await fragmentEventRepository.add(createdEvent);

      return { fragment, plant, createdEvent };
    },
  );
}
