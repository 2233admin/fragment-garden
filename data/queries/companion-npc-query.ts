import { FragmentGardenDatabase, fragmentGardenDb } from "../db";
import { FragmentRepository } from "../repositories/fragment-repository";

export type DormantFragmentView = Readonly<{
  id: string;
  title: string;
  createdAt: string;
  lastInteractedAt: string;
}>;

export type DormantFragmentList = Readonly<{
  items: readonly DormantFragmentView[];
  remainingCount: number;
}>;

const MAX_DORMANT_ITEMS = 5;

/**
 * Reads only the metadata needed by the NPC. The list deliberately comes from
 * fragments rather than the Phaser snapshot so archived and unplaced records
 * are handled consistently with card mode.
 */
export async function queryDormantFragmentList(
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<DormantFragmentList> {
  const fragmentRepository = new FragmentRepository(database);

  return database.transaction("r", database.fragments, async () => {
    const dormant = (await fragmentRepository.list())
      .filter((fragment) => fragment.lifecycleStatus === "dormant")
      .sort((left, right) => {
        const interactionOrder = left.lastInteractedAt.localeCompare(right.lastInteractedAt);
        if (interactionOrder !== 0) {
          return interactionOrder;
        }

        const createdOrder = left.createdAt.localeCompare(right.createdAt);
        return createdOrder !== 0 ? createdOrder : left.id.localeCompare(right.id);
      });

    return {
      items: dormant.slice(0, MAX_DORMANT_ITEMS).map((fragment) => ({
        id: fragment.id,
        title: fragment.title || "未命名碎片",
        createdAt: fragment.createdAt,
        lastInteractedAt: fragment.lastInteractedAt,
      })),
      remainingCount: Math.max(0, dormant.length - MAX_DORMANT_ITEMS),
    };
  });
}

export const COMPANION_NPC_LIMITS = {
  maxDormantItems: MAX_DORMANT_ITEMS,
} as const;
