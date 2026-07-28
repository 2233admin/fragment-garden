import type { GardenPlantSnapshot, PlantStage, PlantVitality } from "@/domain";

import { PLANT_STAGE_LABELS } from "../fragments/fragment-presenters";

type GardenAccessibilitySummaryProps = {
  onOpenPlant: (plantId: string, triggerElement: HTMLButtonElement) => void;
  openingPlantId: string | null;
  snapshot: GardenPlantSnapshot;
};

const VITALITY_LABELS: Readonly<Record<PlantVitality, string>> = {
  active: "活跃",
  dormant: "休眠",
};

const STAGE_ORDER: readonly PlantStage[] = [
  "seedling",
  "growing",
  "budding",
  "blooming",
  "permanent_bloom",
];

export function GardenAccessibilitySummary({
  onOpenPlant,
  openingPlantId,
  snapshot,
}: GardenAccessibilitySummaryProps) {
  const stageCounts = new Map<PlantStage, number>();

  for (const plant of snapshot.plants) {
    stageCounts.set(plant.stage, (stageCounts.get(plant.stage) ?? 0) + 1);
  }

  const stageSummary = STAGE_ORDER.flatMap((stage) => {
    const count = stageCounts.get(stage);
    return count === undefined ? [] : [`${PLANT_STAGE_LABELS[stage]} ${count} 株`];
  }).join(" · ");
  const isEmpty = snapshot.placedPlantCount === 0 && snapshot.unplacedPlantCount === 0;
  const isVisibleGardenFull = snapshot.placedPlantCount >= 36;
  const gardenDescription = isEmpty
    ? "花园正在等待第一颗想法。"
    : `花园中有 ${snapshot.placedPlantCount} 株内容植物。`;
  const gardenGuidance =
    snapshot.unplacedPlantCount > 0
      ? `庭院的可见位置已满；另有 ${snapshot.unplacedPlantCount} 篇笔记保存在卡片模式中。`
      : isEmpty
        ? "写下一条内容，它会在这里长成植物。"
        : isVisibleGardenFull
          ? "庭院已经开满。新的笔记仍会保存，并可在卡片模式中查看。"
          : "继续记录，让庭院慢慢生长。";

  return (
    <section
      aria-labelledby="garden-summary-title"
      className="rounded-2xl border border-garden-line bg-garden-paper px-5 py-4"
      data-plant-count={snapshot.placedPlantCount}
      data-testid="garden-accessibility-summary"
      data-unplaced-plant-count={snapshot.unplacedPlantCount}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div aria-atomic="true" aria-live="polite">
          <h2
            className="font-display text-lg font-semibold text-garden-ink"
            id="garden-summary-title"
          >
            当前花园
          </h2>
          <p className="mt-1 text-sm text-garden-muted">{gardenDescription}</p>
          <p className="mt-1 text-sm text-garden-muted">{gardenGuidance}</p>
        </div>
        <p className="rounded-full bg-garden-soft px-4 py-2 text-xs font-semibold text-garden-accent">
          {stageSummary.length > 0 ? stageSummary : "尚无植物"}
        </p>
      </div>

      <p aria-atomic="true" aria-live="polite" className="sr-only">
        植物状态：{stageSummary.length > 0 ? stageSummary : "尚无植物"}
      </p>

      <ul aria-label="花园植物" className="sr-only">
        {snapshot.plants.map((plant) => (
          <li data-stage={plant.stage} key={plant.plantId}>
            {plant.title}，{PLANT_STAGE_LABELS[plant.stage]}，{VITALITY_LABELS[plant.vitality]}
          </li>
        ))}
      </ul>

      {snapshot.plants.length > 0 ? (
        <details className="mt-4 border-t border-garden-line pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-garden-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-garden-accent">
            用列表直接打开植物
          </summary>
          <ul aria-label="可直接打开的花园植物" className="mt-3 grid gap-2 sm:grid-cols-2">
            {snapshot.plants.map((plant) => {
              const isOpening = openingPlantId === plant.plantId;

              return (
                <li key={plant.plantId}>
                  <button
                    aria-busy={isOpening}
                    aria-label={`打开“${plant.title}”`}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-garden-line bg-garden-soft/60 px-3 py-2 text-left text-sm text-garden-ink hover:border-garden-accent disabled:cursor-wait disabled:opacity-65"
                    disabled={openingPlantId !== null}
                    onClick={(event) => onOpenPlant(plant.plantId, event.currentTarget)}
                    type="button"
                  >
                    <span className="min-w-0 truncate">
                      {isOpening ? "正在打开" : "打开"}“{plant.title}”
                    </span>
                    <span className="shrink-0 text-xs text-garden-muted">
                      {isOpening ? "正在打开" : PLANT_STAGE_LABELS[plant.stage]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
