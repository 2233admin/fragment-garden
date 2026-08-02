import type {
  ExternalLinkImport,
  Fragment,
  FragmentNote,
  MediaAsset,
  Plant,
  SproutRecommendedAction,
} from "../../domain";
import { resolveFragmentContentMarkdown } from "../../domain/fragments/content-markdown";
import {
  safelyParseArchivedEventPayload,
  safelyParseChildFragmentCreatedEventPayload,
  safelyParseCompletedEventPayload,
  safelyParsePartnerSuggestionSavedEventPayload,
  safelyParseRestoredEventPayload,
  safelyParseReviewedEventPayload,
  safelyParseTextAddedEventPayload,
} from "../../validation/fragment-event-payload";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";
import { ExternalLinkImportRepository } from "../repositories/external-link-import-repository";
import { FragmentEventRepository } from "../repositories/fragment-event-repository";
import { FragmentRelationRepository } from "../repositories/fragment-relation-repository";
import { FragmentRepository } from "../repositories/fragment-repository";
import { FragmentNoteRepository } from "../repositories/fragment-note-repository";
import { PlantRepository } from "../repositories/plant-repository";
import { MediaAssetRepository } from "../repositories/media-asset-repository";

export type TextSupplementViewModel = {
  id: string;
  text: string;
  occurredAt: string;
};

export type FragmentAdditionViewModel =
  | Readonly<{
      id: string;
      source: "user";
      content: string;
      occurredAt: string;
    }>
  | Readonly<{
      id: string;
      source: "partner";
      content: string;
      direction: string;
      guidingQuestion: string;
      recommendedAction: SproutRecommendedAction;
      promptVersion: string;
      occurredAt: string;
    }>;

export type RelatedFragmentViewModel = {
  id: string;
  title: string;
};

export type FragmentCompletionViewModel = {
  outcome: string | null;
  occurredAt: string;
};

export type FragmentHistoryItemViewModel = {
  id: string;
  label: string;
  occurredAt: string;
};

export type FragmentDetailViewModel = {
  fragment: Fragment;
  contentMarkdown: string;
  notes: FragmentNote[];
  plant: Plant;
  mediaAsset: MediaAsset | null;
  externalLinkImport: ExternalLinkImport | null;
  textSupplements: TextSupplementViewModel[];
  additions: FragmentAdditionViewModel[];
  completion: FragmentCompletionViewModel | null;
  history: FragmentHistoryItemViewModel[];
  sourceFragment: RelatedFragmentViewModel | null;
  childFragments: RelatedFragmentViewModel[];
};

const SIMPLE_EVENT_LABELS = {
  created: "种下了这条碎片",
  dormant: "这株植物进入了休眠",
  link_added: "添加了一个链接",
  image_added: "添加了一张图片",
  audio_added: "添加了一段语音",
  next_step_added: "写下了下一步",
  progress_recorded: "记录了一次现实进展",
  cluster_joined: "加入了一个花丛",
  deleted: "移除了这条碎片",
} as const;

const REVIEW_LABELS = {
  still_interested: "确认仍然感兴趣",
  not_now: "选择暂时用不上",
  no_longer_needed: "决定不再需要",
} as const;

const RESTORE_LABELS = {
  viewed: "查看内容后恢复了活力",
  reviewed: "复盘后恢复了活力",
  manual_restore: "恢复到了花园",
  content_updated: "更新内容后恢复了活力",
} as const;

function toRelatedFragmentViewModel(fragment: Fragment): RelatedFragmentViewModel | null {
  return fragment.lifecycleStatus === "deleted"
    ? null
    : {
        id: fragment.id,
        title: fragment.title,
      };
}

export function getFragmentDetailViewModel(
  fragmentId: string,
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<FragmentDetailViewModel | undefined> {
  const fragmentRepository = new FragmentRepository(database);
  const fragmentNoteRepository = new FragmentNoteRepository(database);
  const plantRepository = new PlantRepository(database);
  const externalLinkImportRepository = new ExternalLinkImportRepository(database);
  const fragmentEventRepository = new FragmentEventRepository(database);
  const fragmentRelationRepository = new FragmentRelationRepository(database);
  const mediaAssetRepository = new MediaAssetRepository(database);

  return database.transaction(
    "r",
    [
      database.fragments,
      database.fragmentNotes,
      database.plants,
      database.fragmentEvents,
      database.relations,
      database.externalLinkImports,
      database.mediaAssets,
    ],
    async () => {
      const [
        fragment,
        plant,
        externalLinkImport,
        mediaAsset,
        notes,
        events,
        sourceRelations,
        childRelations,
      ] = await Promise.all([
        fragmentRepository.getById(fragmentId),
        plantRepository.getByFragmentId(fragmentId),
        externalLinkImportRepository.getByFragmentId(fragmentId),
        mediaAssetRepository.getByFragmentId(fragmentId),
        fragmentNoteRepository.listByFragmentId(fragmentId),
        fragmentEventRepository.listByFragmentId(fragmentId),
        fragmentRelationRepository.listBySourceFragmentId(fragmentId),
        fragmentRelationRepository.listByTargetFragmentId(fragmentId),
      ]);

      if (fragment === undefined) {
        return undefined;
      }

      if (plant === undefined) {
        throw new Error(`Plant not found for fragment ${fragmentId}`);
      }

      const textSupplements: TextSupplementViewModel[] = [];
      const additions: FragmentAdditionViewModel[] = [];
      const history: FragmentHistoryItemViewModel[] = [];
      let completion: FragmentCompletionViewModel | null = null;

      for (const event of events) {
        if (event.type === "text_added") {
          const payload = safelyParseTextAddedEventPayload(event.payload);

          if (payload !== null) {
            textSupplements.push({
              id: event.id,
              text: payload.text,
              occurredAt: event.occurredAt,
            });
            additions.push({
              id: event.id,
              source: "user",
              content: payload.text,
              occurredAt: event.occurredAt,
            });
            history.push({
              id: event.id,
              label: "补充了一段新内容",
              occurredAt: event.occurredAt,
            });
          }
        } else if (event.type === "partner_suggestion_saved") {
          const payload = safelyParsePartnerSuggestionSavedEventPayload(event.payload);

          if (payload !== null) {
            additions.push({
              id: event.id,
              source: "partner",
              content: [
                `具体化方向：${payload.direction}`,
                `引导问题：${payload.guidingQuestion}`,
                `推荐动作：${payload.recommendedAction}`,
              ].join("\n"),
              direction: payload.direction,
              guidingQuestion: payload.guidingQuestion,
              recommendedAction: payload.recommendedAction,
              promptVersion: payload.promptVersion,
              occurredAt: event.occurredAt,
            });
            history.push({
              id: event.id,
              label: "保存了一条伙伴建议",
              occurredAt: event.occurredAt,
            });
          }
        } else if (event.type === "reviewed") {
          const payload = safelyParseReviewedEventPayload(event.payload);

          if (payload !== null) {
            history.push({
              id: event.id,
              label: REVIEW_LABELS[payload.decision],
              occurredAt: event.occurredAt,
            });
          }
        } else if (event.type === "restored") {
          const payload = safelyParseRestoredEventPayload(event.payload);

          if (payload !== null) {
            history.push({
              id: event.id,
              label: RESTORE_LABELS[payload.reason],
              occurredAt: event.occurredAt,
            });
          }
        } else if (event.type === "completed") {
          const payload = safelyParseCompletedEventPayload(event.payload);

          if (payload !== null) {
            completion = {
              outcome: payload.outcome,
              occurredAt: event.occurredAt,
            };
            history.push({
              id: event.id,
              label: "这株植物已经永久盛开",
              occurredAt: event.occurredAt,
            });
          }
        } else if (event.type === "child_fragment_created") {
          if (safelyParseChildFragmentCreatedEventPayload(event.payload) !== null) {
            history.push({
              id: event.id,
              label: "它发展出了一个新想法",
              occurredAt: event.occurredAt,
            });
          }
        } else if (event.type === "archived") {
          if (safelyParseArchivedEventPayload(event.payload) !== null) {
            history.push({
              id: event.id,
              label: "封存了这条碎片",
              occurredAt: event.occurredAt,
            });
          }
        } else if (event.type !== "viewed") {
          const label = SIMPLE_EVENT_LABELS[event.type as keyof typeof SIMPLE_EVENT_LABELS];

          if (label !== undefined) {
            history.push({
              id: event.id,
              label,
              occurredAt: event.occurredAt,
            });
          }
        }
      }

      if (
        completion === null &&
        fragment.completionStatus === "completed" &&
        fragment.completedAt !== null
      ) {
        completion = {
          outcome: null,
          occurredAt: fragment.completedAt,
        };
      }

      const confirmedSourceRelation = sourceRelations.find(
        (relation) =>
          relation.relationType === "grows_from" &&
          relation.status === "confirmed" &&
          relation.targetFragmentId !== fragmentId,
      );
      const sourceFragmentId =
        confirmedSourceRelation?.targetFragmentId ?? fragment.parentFragmentId;
      const confirmedChildIds = [
        ...new Set(
          childRelations
            .filter(
              (relation) =>
                relation.relationType === "grows_from" &&
                relation.status === "confirmed" &&
                relation.sourceFragmentId !== fragmentId,
            )
            .map((relation) => relation.sourceFragmentId),
        ),
      ];
      const [sourceFragment, ...childFragments] = await Promise.all([
        sourceFragmentId === null ? undefined : fragmentRepository.getById(sourceFragmentId),
        ...confirmedChildIds.map((childFragmentId) => fragmentRepository.getById(childFragmentId)),
      ]);

      return {
        fragment,
        contentMarkdown: resolveFragmentContentMarkdown(
          fragment,
          externalLinkImport ?? null,
          mediaAsset ?? null,
        ),
        notes,
        plant,
        mediaAsset: mediaAsset ?? null,
        externalLinkImport: externalLinkImport ?? null,
        textSupplements,
        additions,
        completion,
        history,
        sourceFragment:
          sourceFragment === undefined ? null : toRelatedFragmentViewModel(sourceFragment),
        childFragments: childFragments.flatMap((childFragment) => {
          if (childFragment === undefined) {
            return [];
          }

          const viewModel = toRelatedFragmentViewModel(childFragment);
          return viewModel === null ? [] : [viewModel];
        }),
      };
    },
  );
}
