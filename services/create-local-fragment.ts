import {
  PLANT_SLOT_IDS,
  allocateFirstAvailablePlantSlot,
  createUuid,
  toIsoTimestamp,
  type Fragment,
  type FragmentEvent,
  type Plant,
} from "../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../data/db";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";

const INITIAL_EVENT_RULE_VERSION = 1;

export type CreateLocalFragmentInput = {
  title: string;
  rawText: string;
};

export type CreateLocalFragmentResult = {
  fragment: Fragment;
  plant: Plant;
  createdEvent: FragmentEvent;
};

export type CreateLocalFragmentDependencies = {
  database?: FragmentGardenDatabase;
  createId?: () => string;
  now?: () => Date;
};

export async function createLocalFragment(
  input: CreateLocalFragmentInput,
  dependencies: CreateLocalFragmentDependencies = {},
): Promise<CreateLocalFragmentResult> {
  const database = dependencies.database ?? fragmentGardenDb;
  const createId = dependencies.createId ?? createUuid;
  const now = dependencies.now ?? (() => new Date());

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
      const timestamp = toIsoTimestamp(now());

      const fragment: Fragment = {
        id: createId(),
        contentType: "text",
        title: input.title,
        rawText: input.rawText,
        sourceUrl: null,
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
        ruleVersion: INITIAL_EVENT_RULE_VERSION,
      };

      await fragmentRepository.add(fragment);
      await plantRepository.add(plant);
      await fragmentEventRepository.add(createdEvent);

      return { fragment, plant, createdEvent };
    },
  );
}
