import {
  PLANT_SLOT_IDS,
  allocateFirstAvailablePlantSlot,
  calculateGrowthScore,
  deriveLocalFragmentTitle,
  normalizeContentMarkdown,
  plainTextToMarkdown,
  resolvePlantStage,
  type Fragment,
  type FragmentEvent,
  type FragmentRelation,
  type Plant,
} from "../domain";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRelationRepository } from "../data/repositories/fragment-relation-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import {
  parseChildFragmentCreatedEventPayload,
  parseRestoredEventPayload,
} from "../validation/fragment-event-payload";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  requireFragmentCanInteract,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type CreateChildFragmentFromParentInput = Readonly<{
  parentFragmentId: string;
  title?: string;
  rawText: string;
  contentMarkdown?: string;
  now: string;
}>;

export type CreateChildFragmentFromParentResult = Readonly<{
  parentFragment: Fragment;
  parentPlant: Plant;
  childFragment: Fragment;
  childPlant: Plant;
  childCreatedEvent: FragmentEvent;
  parentChildCreatedEvent: FragmentEvent;
  relation: FragmentRelation;
  restoredEvent: FragmentEvent | null;
}>;

export async function createChildFragmentFromParent(
  input: CreateChildFragmentFromParentInput,
  dependencies: LocalServiceDependencies = {},
): Promise<CreateChildFragmentFromParentResult> {
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
  const restoredPayload = parseRestoredEventPayload({ reason: "content_updated" });
  const { database, createId, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const fragmentRepository = new FragmentRepository(database);
  const plantRepository = new PlantRepository(database);
  const fragmentEventRepository = new FragmentEventRepository(database);
  const fragmentRelationRepository = new FragmentRelationRepository(database);

  return database.transaction(
    "rw",
    database.fragments,
    database.plants,
    database.fragmentEvents,
    database.relations,
    async () => {
      const [parentFragment, parentPlant, parentEvents, plants] = await Promise.all([
        fragmentRepository.getById(input.parentFragmentId),
        plantRepository.getByFragmentId(input.parentFragmentId),
        fragmentEventRepository.listByFragmentId(input.parentFragmentId),
        plantRepository.list(),
      ]);

      if (parentFragment === undefined) {
        throw new Error(`Fragment ${input.parentFragmentId} was not found`);
      }

      if (parentPlant === undefined) {
        throw new Error(`Plant for fragment ${input.parentFragmentId} was not found`);
      }

      requireFragmentCanInteract(parentFragment);

      const childFragmentId = createId();
      const childFragment: Fragment = {
        id: childFragmentId,
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
        parentFragmentId: parentFragment.id,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
        completedAt: null,
      };
      const occupiedSlotIds = plants
        .filter(
          (plant) => plant.id !== parentPlant.id || parentFragment.lifecycleStatus !== "archived",
        )
        .map((plant) => plant.slotId);
      const childPlant: Plant = {
        id: createId(),
        fragmentId: childFragment.id,
        speciesId: null,
        stage: "seedling",
        vitality: "active",
        growthScore: 0,
        slotId: allocateFirstAvailablePlantSlot(PLANT_SLOT_IDS, occupiedSlotIds),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const childCreatedEvent: FragmentEvent = {
        id: createId(),
        fragmentId: childFragment.id,
        type: "created",
        payload: null,
        occurredAt: timestamp,
        ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
      };
      const parentChildCreatedEvent: FragmentEvent = {
        id: createId(),
        fragmentId: parentFragment.id,
        type: "child_fragment_created",
        payload: parseChildFragmentCreatedEventPayload({
          childFragmentId: childFragment.id,
        }),
        occurredAt: timestamp,
        ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
      };
      const relation: FragmentRelation = {
        id: createId(),
        sourceFragmentId: childFragment.id,
        targetFragmentId: parentFragment.id,
        relationType: "grows_from",
        status: "confirmed",
        similarityScore: null,
        explanation: null,
        createdAt: timestamp,
        confirmedAt: timestamp,
      };
      const wasDormant = parentFragment.lifecycleStatus === "dormant";
      const isArchived = parentFragment.lifecycleStatus === "archived";
      const restoredEvent: FragmentEvent | null = wasDormant
        ? {
            id: createId(),
            fragmentId: parentFragment.id,
            type: "restored",
            payload: restoredPayload,
            occurredAt: timestamp,
            ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
          }
        : null;
      const parentEventsAfterCreation =
        restoredEvent === null
          ? [...parentEvents, parentChildCreatedEvent]
          : [...parentEvents, parentChildCreatedEvent, restoredEvent];
      const parentGrowthScore = calculateGrowthScore(parentEventsAfterCreation);
      const parentStage = resolvePlantStage(
        parentEventsAfterCreation,
        parentFragment.completionStatus,
      );
      const updatedParentFragment: Fragment = {
        ...parentFragment,
        lifecycleStatus: isArchived ? "archived" : "active",
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
      };
      const updatedParentPlant: Plant = {
        ...parentPlant,
        stage: parentStage,
        vitality: "active",
        growthScore: parentGrowthScore,
        slotId: isArchived ? null : parentPlant.slotId,
        updatedAt: timestamp,
      };

      await fragmentRepository.add(childFragment);
      await plantRepository.add(childPlant);
      await fragmentEventRepository.add(childCreatedEvent);
      requireRecordUpdated(
        await fragmentRepository.update(parentFragment.id, {
          lifecycleStatus: updatedParentFragment.lifecycleStatus,
          updatedAt: timestamp,
          lastInteractedAt: timestamp,
        }),
        "Fragment",
      );
      requireRecordUpdated(
        await plantRepository.update(parentPlant.id, {
          stage: parentStage,
          vitality: "active",
          growthScore: parentGrowthScore,
          slotId: updatedParentPlant.slotId,
          updatedAt: timestamp,
        }),
        "Plant",
      );
      await fragmentEventRepository.add(parentChildCreatedEvent);
      await fragmentRelationRepository.add(relation);
      if (restoredEvent !== null) {
        await fragmentEventRepository.add(restoredEvent);
      }

      return {
        parentFragment: updatedParentFragment,
        parentPlant: updatedParentPlant,
        childFragment,
        childPlant,
        childCreatedEvent,
        parentChildCreatedEvent,
        relation,
        restoredEvent,
      };
    },
  );
}
