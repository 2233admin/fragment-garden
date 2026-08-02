import type { Fragment, FragmentEvent, Plant } from "../domain";
import { ContentProcessingJobRepository } from "../data/repositories/content-processing-job-repository";
import { ExternalLinkImportRepository } from "../data/repositories/external-link-import-repository";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import { parseReviewedEventPayload } from "../validation/fragment-event-payload";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type SoftDeleteFragmentInput = {
  fragmentId: string;
  reviewDecision?: "no_longer_needed";
};

export type SoftDeleteFragmentResult = {
  fragment: Fragment;
  plant: Plant;
  deletedEvent: FragmentEvent | null;
  reviewedEvent: FragmentEvent | null;
};

export async function softDeleteFragment(
  input: SoftDeleteFragmentInput,
  dependencies: LocalServiceDependencies = {},
): Promise<SoftDeleteFragmentResult> {
  if (input.reviewDecision !== undefined && input.reviewDecision !== "no_longer_needed") {
    throw new Error(`Unsupported delete review decision: ${String(input.reviewDecision)}`);
  }

  const reviewedPayload =
    input.reviewDecision === undefined
      ? null
      : parseReviewedEventPayload({ decision: input.reviewDecision });
  const { database, createId, timestamp } = resolveLocalServiceDependencies(dependencies);
  const fragmentRepository = new FragmentRepository(database);
  const plantRepository = new PlantRepository(database);
  const fragmentEventRepository = new FragmentEventRepository(database);
  const externalLinkImportRepository = new ExternalLinkImportRepository(database);
  const contentProcessingJobRepository = new ContentProcessingJobRepository(database);

  return database.transaction(
    "rw",
    [
      database.fragments,
      database.plants,
      database.fragmentEvents,
      database.externalLinkImports,
      database.contentProcessingJobs,
    ],
    async () => {
      const [fragment, plant, externalLinkImport, processingJobs] = await Promise.all([
        fragmentRepository.getById(input.fragmentId),
        plantRepository.getByFragmentId(input.fragmentId),
        externalLinkImportRepository.getByFragmentId(input.fragmentId),
        contentProcessingJobRepository.list(),
      ]);

      if (fragment === undefined) {
        throw new Error(`Fragment ${input.fragmentId} was not found`);
      }

      if (plant === undefined) {
        throw new Error(`Plant for fragment ${input.fragmentId} was not found`);
      }

      for (const job of processingJobs) {
        if (job.status === "completed" && job.createdFragmentId === fragment.id) {
          await contentProcessingJobRepository.delete(job.id);
          continue;
        }
        if (
          job.kind === "sprout" &&
          job.sourceFragmentId === fragment.id &&
          job.status !== "completed" &&
          job.status !== "cancelled"
        ) {
          requireRecordUpdated(
            await contentProcessingJobRepository.update(job.id, {
              status: "cancelled",
              sourceSnapshot: null,
              providerTaskId: null,
              processingRequestId: null,
              resultTitle: null,
              resultMarkdown: null,
              errorCode: "source_missing",
              errorMessage: "源笔记已不存在。",
              updatedAt: timestamp,
            }),
            "Content processing job",
          );
        }
      }

      if (
        externalLinkImport !== undefined &&
        (externalLinkImport.status === "pending" || externalLinkImport.status === "processing")
      ) {
        requireRecordUpdated(
          await externalLinkImportRepository.update(externalLinkImport.id, {
            status: "failed",
            errorCode: "fragment_deleted",
            errorMessage: "链接碎片已删除，读取任务已经停止。",
            updatedAt: timestamp,
          }),
          "External link import",
        );
      }

      if (fragment.lifecycleStatus === "deleted") {
        const repairedPlant: Plant =
          plant.slotId === null
            ? plant
            : {
                ...plant,
                slotId: null,
                updatedAt: timestamp,
              };

        if (repairedPlant !== plant) {
          requireRecordUpdated(
            await plantRepository.update(plant.id, {
              slotId: null,
              updatedAt: timestamp,
            }),
            "Plant",
          );
        }

        return {
          fragment,
          plant: repairedPlant,
          deletedEvent: null,
          reviewedEvent: null,
        };
      }

      const updatedFragment: Fragment = {
        ...fragment,
        lifecycleStatus: "deleted",
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
      };
      const updatedPlant: Plant = {
        ...plant,
        slotId: null,
        updatedAt: timestamp,
      };
      const deletedEvent: FragmentEvent = {
        id: createId(),
        fragmentId: fragment.id,
        type: "deleted",
        payload: null,
        occurredAt: timestamp,
        ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
      };
      const reviewedEvent: FragmentEvent | null =
        reviewedPayload === null
          ? null
          : {
              id: createId(),
              fragmentId: fragment.id,
              type: "reviewed",
              payload: reviewedPayload,
              occurredAt: timestamp,
              ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
            };

      requireRecordUpdated(
        await fragmentRepository.update(fragment.id, {
          lifecycleStatus: "deleted",
          updatedAt: timestamp,
          lastInteractedAt: timestamp,
        }),
        "Fragment",
      );
      requireRecordUpdated(
        await plantRepository.update(plant.id, {
          slotId: null,
          updatedAt: timestamp,
        }),
        "Plant",
      );
      await fragmentEventRepository.add(deletedEvent);
      if (reviewedEvent !== null) {
        await fragmentEventRepository.add(reviewedEvent);
      }

      return {
        fragment: updatedFragment,
        plant: updatedPlant,
        deletedEvent,
        reviewedEvent,
      };
    },
  );
}
