import type { GardenPlantSnapshot, PlantStage, PlantVitality } from "@/domain";

import { PLANT_STAGE_LABELS } from "../fragments/fragment-presenters";

type GardenAccessibilitySummaryProps = {
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

export function GardenAccessibilitySummary({ snapshot }: GardenAccessibilitySummaryProps) {
  const stageCounts = new Map<PlantStage, number>();

  for (const plant of snapshot.plants) {
    stageCounts.set(plant.stage, (stageCounts.get(plant.stage) ?? 0) + 1);
  }

  const stageSummary = STAGE_ORDER.flatMap((stage) => {
    const count = stageCounts.get(stage);
    return count === undefined ? [] : [`${PLANT_STAGE_LABELS[stage]} ${count} 株`];
  }).join(" · ");

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
          <p className="mt-1 text-sm text-garden-muted">
            花园中有 {snapshot.placedPlantCount} 株已放置植物。
          </p>
          <p className="mt-1 text-sm text-garden-muted">
            {snapshot.unplacedPlantCount > 0
              ? `有 ${snapshot.unplacedPlantCount} 株植物等待新的种植位置。`
              : "所有植物都已有种植位置。"}
          </p>
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
    </section>
  );
}
