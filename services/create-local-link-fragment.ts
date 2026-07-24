import {
  PLANT_SLOT_IDS,
  allocateFirstAvailablePlantSlot,
  deriveLocalLinkTitle,
  normalizeExternalUrl,
  type ExternalLinkImport,
  type Fragment,
  type FragmentEvent,
  type LinkImportInitiator,
  type Plant,
} from "../domain";
import { findExistingExternalLinkImport } from "../data/queries/external-link-import-query";
import { ExternalLinkImportRepository } from "../data/repositories/external-link-import-repository";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import { externalUrlSchema } from "../validation/external-url";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type CreateLocalLinkFragmentInput = Readonly<{
  sourceUrl: string;
  title?: string;
  initiatedBy: LinkImportInitiator;
  now: string;
  allowDuplicate?: boolean;
}>;

export type CreatedLocalLinkFragment = Readonly<{
  kind: "created";
  fragment: Fragment;
  plant: Plant;
  createdEvent: FragmentEvent;
  externalLinkImport: ExternalLinkImport;
}>;

export type DuplicateLocalLinkFragment = Readonly<{
  kind: "duplicate";
  fragment: Fragment;
  externalLinkImport: ExternalLinkImport;
}>;

export type CreateLocalLinkFragmentResult = CreatedLocalLinkFragment | DuplicateLocalLinkFragment;

export async function createLocalLinkFragment(
  input: CreateLocalLinkFragmentInput,
  dependencies: LocalServiceDependencies = {},
): Promise<CreateLocalLinkFragmentResult> {
  const sourceUrl = externalUrlSchema.parse(input.sourceUrl);
  const normalizedUrl = normalizeExternalUrl(sourceUrl);
  const manualTitle = input.title?.trim();
  const userProvidedTitle = manualTitle !== undefined && manualTitle.length > 0;
  const title = userProvidedTitle ? manualTitle : deriveLocalLinkTitle(sourceUrl);
  const { database, createId, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const fragmentRepository = new FragmentRepository(database);
  const plantRepository = new PlantRepository(database);
  const fragmentEventRepository = new FragmentEventRepository(database);
  const externalLinkImportRepository = new ExternalLinkImportRepository(database);

  return database.transaction(
    "rw",
    database.fragments,
    database.plants,
    database.fragmentEvents,
    database.externalLinkImports,
    async () => {
      if (input.allowDuplicate !== true) {
        const existingLinkImport = await findExistingExternalLinkImport(normalizedUrl, database);

        if (existingLinkImport !== null) {
          return {
            kind: "duplicate",
            fragment: existingLinkImport.fragment,
            externalLinkImport: existingLinkImport.externalLinkImport,
          };
        }
      }

      const occupiedSlotIds = (await plantRepository.list()).map((plant) => plant.slotId);
      const fragment: Fragment = {
        id: createId(),
        contentType: "link",
        title,
        rawText: null,
        sourceUrl,
        summary: null,
        keywords: [],
        lifecycleStatus: "active",
        completionStatus: "open",
        analysisStatus: "pending",
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
      const externalLinkImport: ExternalLinkImport = {
        id: createId(),
        fragmentId: fragment.id,
        provider: "getnote",
        sourceUrl,
        normalizedUrl,
        canonicalUrl: null,
        sourceContent: null,
        sourceContentTruncated: false,
        status: "pending",
        initiatedBy: input.initiatedBy,
        taskId: null,
        externalNoteId: null,
        providerRequestId: null,
        attemptCount: 0,
        attemptGeneration: 0,
        userProvidedTitle,
        userProvidedContent: false,
        errorCode: null,
        errorMessage: null,
        terminalNotificationStatus: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        startedAt: null,
        lastPolledAt: null,
        completedAt: null,
      };

      await fragmentRepository.add(fragment);
      await plantRepository.add(plant);
      await fragmentEventRepository.add(createdEvent);
      await externalLinkImportRepository.add(externalLinkImport);

      return {
        kind: "created",
        fragment,
        plant,
        createdEvent,
        externalLinkImport,
      };
    },
  );
}
