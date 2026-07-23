import type { Recommendation } from "../../domain/shared/types";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";

export type RecommendationUpdate = Partial<Omit<Recommendation, "id" | "fragmentId">>;

export class RecommendationRepository {
  constructor(private readonly database: FragmentGardenDatabase = fragmentGardenDb) {}

  getById(id: string): Promise<Recommendation | undefined> {
    return this.database.recommendations.get(id);
  }

  add(recommendation: Recommendation): Promise<string> {
    return this.database.recommendations.add(recommendation);
  }

  update(id: string, changes: RecommendationUpdate): Promise<number> {
    return this.database.recommendations.update(id, changes);
  }

  async list(): Promise<Recommendation[]> {
    const recommendations = await this.database.recommendations.toArray();

    return recommendations.sort((left, right) => {
      const shownAtComparison = left.shownAt.localeCompare(right.shownAt);
      return shownAtComparison === 0 ? left.id.localeCompare(right.id) : shownAtComparison;
    });
  }
}
