import {
  calculateGrowthScore,
  resolvePlantStage,
  type Fragment,
  type FragmentEvent,
  type Plant,
} from "../domain";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import { parseTextAddedEventPayload } from "../validation/fragment-event-payload";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  requireFragmentCanInteract,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type AddTextSupplementInput = {
  fragmentId: string;
  text: string;
};

export type AddTextSupplementResult = {
  fragment: Fragment;
  plant: Plant;
  textAddedEvent: FragmentEvent;
};

export async function addTextSupplement(
  input: AddTextSupplementInput,
  dependencies: LocalServiceDependencies = {},
): Promise<AddTextSupplementResult> {
  const payload = parseTextAddedEventPayload({ text: input.text });
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
      const [fragment, plant, existingEvents] = await Promise.all([
        fragmentRepository.getById(input.fragmentId),
        plantRepository.getByFragmentId(input.fragmentId),
        fragmentEventRepository.listByFragmentId(input.fragmentId),
      ]);

      if (fragment === undefined) {
        throw new Error(`Fragment ${input.fragmentId} was not found`);
      }

      if (plant === undefined) {
        throw new Error(`Plant for fragment ${input.fragmentId} was not found`);
      }

      requireFragmentCanInteract(fragment);

      const textAddedEvent: FragmentEvent = {
        id: createId(),
        fragmentId: fragment.id,
        type: "text_added",
        payload,
        occurredAt: timestamp,
        ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
      };
      const eventsAfterAddition = [...existingEvents, textAddedEvent];
      const growthScore = calculateGrowthScore(eventsAfterAddition);
      const stage = resolvePlantStage(eventsAfterAddition, fragment.completionStatus);
      const updatedFragment: Fragment = {
        ...fragment,
        lifecycleStatus: "active",
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
      };
      const updatedPlant: Plant = {
        ...plant,
        stage,
        vitality: "active",
        growthScore,
        updatedAt: timestamp,
      };

      requireRecordUpdated(
        await fragmentRepository.update(fragment.id, {
          lifecycleStatus: "active",
          updatedAt: timestamp,
          lastInteractedAt: timestamp,
        }),
        "Fragment",
      );
      requireRecordUpdated(
        await plantRepository.update(plant.id, {
          stage,
          vitality: "active",
          growthScore,
          updatedAt: timestamp,
        }),
        "Plant",
      );
      await fragmentEventRepository.add(textAddedEvent);

      return {
        fragment: updatedFragment,
        plant: updatedPlant,
        textAddedEvent,
      };
    },
  );
}
